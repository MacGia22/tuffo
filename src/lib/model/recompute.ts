import "server-only";

import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fitChlorineModel,
  parseStoredCoefficients,
  populationPrior,
  storedCoefficients,
  type Fit,
  type Prior,
} from "@/engine/server";
import {
  buildTestPairs,
  observationsFrom,
  type ModelDose,
  type ModelEvent,
  type ModelPool,
  type ModelReading,
  type ModelWeatherDay,
  type TestPair,
} from "./observations";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Loads a pool's log with the service key, fits its chlorine model and stores the result
 * in pool_models (server-only). Runs after each new test (in the background) and for
 * every pool in the nightly job. Failures are logged and never thrown.
 */

/** Test history the model looks at. */
export const HISTORY_DAYS = 120;
const DAY_MS = 86_400_000;

interface PoolRow {
  id: string;
  volume_l: number;
  sanitizer: "chlorine" | "swg";
  covered: boolean;
  swg_cell_lb_per_day: number | null;
  timezone: string | null;
  cell_id: string | null;
}

export interface PoolLog {
  pool: ModelPool;
  pairs: TestPair[];
}

export async function loadPoolLog(admin: SupabaseClient, poolId: string, now = Date.now()): Promise<PoolLog | null> {
  const { data: pool, error } = await admin
    .from("pools")
    .select("id, volume_l, sanitizer, covered, swg_cell_lb_per_day, timezone, cell_id")
    .eq("id", poolId)
    .maybeSingle<PoolRow>();
  if (error) throw new Error(`pool ${poolId}: ${error.message}`);
  if (!pool) return null;

  const since = new Date(now - HISTORY_DAYS * DAY_MS).toISOString();
  const [{ data: readings, error: rErr }, { data: doses, error: dErr }, { data: events, error: eErr }] =
    await Promise.all([
      admin
        .from("readings")
        .select("taken_at, fc, cya")
        .eq("pool_id", poolId)
        .gte("taken_at", since)
        .order("taken_at")
        .limit(1000)
        .returns<ModelReading[]>(),
      admin
        .from("doses")
        .select("added_at, product_id, amount")
        .eq("pool_id", poolId)
        .gte("added_at", since)
        .limit(2000)
        .returns<ModelDose[]>(),
      admin
        .from("events")
        .select("occurred_at, kind")
        .eq("pool_id", poolId)
        .gte("occurred_at", since)
        .limit(1000)
        .returns<ModelEvent[]>(),
    ]);
  if (rErr || dErr || eErr) throw new Error(`pool ${poolId} log: ${(rErr ?? dErr ?? eErr)?.message}`);

  let weather: ModelWeatherDay[] = [];
  if (pool.cell_id && readings && readings.length > 1) {
    const from = new Date(Date.parse(readings[0].taken_at) - DAY_MS).toISOString().slice(0, 10);
    const { data, error: wErr } = await admin
      .from("weather_daily")
      .select("date, uv_index_max, sunshine_s, shortwave_mj_m2, tmax_c, precipitation_mm")
      .eq("cell_id", pool.cell_id)
      .gte("date", from)
      .order("date")
      .returns<ModelWeatherDay[]>();
    if (wErr) throw new Error(`pool ${poolId} weather: ${wErr.message}`);
    weather = data ?? [];
  }

  const modelPool: ModelPool = {
    volumeL: Number(pool.volume_l),
    sanitizer: pool.sanitizer,
    covered: pool.covered,
    swgCellLbPerDay: pool.swg_cell_lb_per_day === null ? null : Number(pool.swg_cell_lb_per_day),
    timezone: pool.timezone ?? "UTC",
  };
  const pairs = buildTestPairs({ pool: modelPool, readings: readings ?? [], doses: doses ?? [], events: events ?? [], weather });
  return { pool: modelPool, pairs };
}

/** Population prior from every other pool's stored fit. */
export async function loadPopulationPrior(admin: SupabaseClient, excludePoolId?: string): Promise<Prior> {
  const { data, error } = await admin
    .from("pool_models")
    .select("pool_id, coefficients, sample_count")
    .returns<{ pool_id: string; coefficients: unknown; sample_count: number }[]>();
  if (error) throw new Error(`pool_models: ${error.message}`);
  const fits = (data ?? [])
    .filter((row) => row.pool_id !== excludePoolId)
    .map((row) => ({ parsed: parseStoredCoefficients(row.coefficients), sampleCount: row.sample_count }))
    .filter((row): row is { parsed: NonNullable<typeof row.parsed>; sampleCount: number } => row.parsed !== null)
    .map((row) => ({ coefficients: row.parsed.coefficients, sampleCount: row.sampleCount }));
  return populationPrior(fits);
}

/** Days from the first to the last test of the pairs the fit used. */
export function spanDays(pairs: TestPair[]): number | null {
  const used = pairs.filter((p) => p.skip === null && p.drivers !== null);
  if (used.length === 0) return null;
  return (Date.parse(used[used.length - 1].to) - Date.parse(used[0].from)) / DAY_MS;
}

async function fitAndStore(admin: SupabaseClient, poolId: string, prior: Prior): Promise<Fit | null> {
  const log = await loadPoolLog(admin, poolId);
  if (!log) return null;
  const fit = fitChlorineModel(observationsFrom(log.pairs), prior);
  const { error } = await admin.from("pool_models").upsert(
    {
      pool_id: poolId,
      coefficients: storedCoefficients(fit, spanDays(log.pairs)),
      sample_count: fit.sampleCount,
      residual: fit.residual === null ? null : Math.round(fit.residual * 10_000) / 10_000,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "pool_id" },
  );
  if (error) throw new Error(`pool_models upsert: ${error.message}`);
  return fit;
}

/** One pool, after a new test. Never throws. */
export async function recomputePoolModel(admin: SupabaseClient, poolId: string): Promise<Fit | null> {
  try {
    return await fitAndStore(admin, poolId, await loadPopulationPrior(admin, poolId));
  } catch (err) {
    console.error(`[model] pool ${poolId}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/**
 * Refits the pool's model once the response has been sent. Call only after the user's
 * own client has written to that pool, which proves they own it.
 */
export function recomputeAfterResponse(poolId: string): void {
  after(async () => {
    try {
      await recomputePoolModel(createSupabaseAdminClient(), poolId);
    } catch (err) {
      console.error(`[model] pool ${poolId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  });
}

export interface ModelJobResult {
  pools: number;
  fitted: number;
  failed: number;
}

/** Every pool with at least two tests, for the nightly job. Never throws. */
export async function recomputeAllModels(admin: SupabaseClient): Promise<ModelJobResult> {
  const result: ModelJobResult = { pools: 0, fitted: 0, failed: 0 };
  try {
    const { data: pools, error } = await admin.from("pools").select("id").returns<{ id: string }[]>();
    if (error) throw new Error(error.message);
    result.pools = pools?.length ?? 0;
    for (const { id } of pools ?? []) {
      const fit = await recomputePoolModel(admin, id);
      if (fit) result.fitted += 1;
      else result.failed += 1;
    }
  } catch (err) {
    console.error(`[model] nightly: ${err instanceof Error ? err.message : String(err)}`);
  }
  return result;
}
