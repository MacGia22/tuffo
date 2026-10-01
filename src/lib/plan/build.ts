import "server-only";

import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  dayDrivers,
  DEFAULT_CYA,
  doseFor,
  effectsOf,
  GRAMS_PER_POUND,
  parseStoredCoefficients,
  planWeek,
  predictLoss,
  type Coefficients,
  type WeatherDrivers,
} from "@/engine/server";
import { loadPopulationPrior } from "@/lib/model/recompute";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { estimateStartFc, type StoredPlanDay, type StoredPlanSummary } from "./stored";
import { loadOwnRain, withOwnRain } from "@/lib/weather/own-rain";
import { cellLevels } from "@/lib/salt-cells";
import { loadPoolEstimate } from "@/lib/model/pool-estimate";

/**
 * Builds and stores a pool's 7-day plan with the service key: the pool's model (or the
 * population prior for a new pool), the latest tests, chlorine logged since, and the
 * forecast for its weather cell from today on. Runs nightly after the weather is stored
 * and after each test. Never throws; failures are logged with [plan].
 */

const DAY_MS = 86_400_000;
const PRODUCT = "liquid-chlorine-12.5";

interface PoolRow {
  id: string;
  volume_l: number | string;
  surface_area_m2: number | string | null;
  sanitizer: "chlorine" | "swg";
  surface: "plaster" | "vinyl" | "fiberglass";
  covered: boolean;
  swg_cell_lb_per_day: number | string | null;
  swg_cell_model?: string | null;
  timezone: string | null;
  cell_id: string | null;
}

interface ForecastRow {
  date: string;
  uv_index_max: number | null;
  sunshine_s: number | null;
  shortwave_mj_m2: number | null;
  tmax_c: number | null;
  precipitation_mm: number | null;
}

function n(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const v = Number(value);
  return Number.isFinite(v) ? v : null;
}

function localDate(now: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now));
}

function weatherOf(row: ForecastRow): WeatherDrivers {
  return {
    uvIndexMax: n(row.uv_index_max),
    sunshineHours: row.sunshine_s === null ? null : Number(row.sunshine_s) / 3600,
    shortwaveMj: n(row.shortwave_mj_m2),
    tmaxC: n(row.tmax_c),
    rainMm: n(row.precipitation_mm),
  };
}

/** Builds the plan and writes it; returns whether a plan was stored. */
export async function buildPlan(admin: SupabaseClient, poolId: string, now = Date.now()): Promise<boolean> {
  const { data: pool, error } = await admin
    .from("pools")
    .select("id, volume_l, surface_area_m2, sanitizer, surface, covered, swg_cell_lb_per_day, swg_cell_model, timezone, cell_id")
    .eq("id", poolId)
    .maybeSingle<PoolRow>();
  if (error) throw new Error(`pool: ${error.message}`);
  if (!pool || !pool.cell_id) return false;
  const timeZone = pool.timezone ?? "UTC";
  const volumeL = Number(pool.volume_l);

  // Latest value of each measure over the last few months.
  const { data: readings, error: rErr } = await admin
    .from("readings")
    .select("taken_at, fc, cya, ch, salt")
    .eq("pool_id", poolId)
    .gte("taken_at", new Date(now - 120 * DAY_MS).toISOString())
    .order("taken_at", { ascending: false })
    .limit(200)
    .returns<{ taken_at: string; fc: number | null; cya: number | null; ch: number | null; salt: number | null }[]>();
  if (rErr) throw new Error(`readings: ${rErr.message}`);
  const latestFc = (readings ?? []).find((r) => r.fc !== null);
  if (!latestFc) {
    await admin.from("plans").delete().eq("pool_id", poolId);
    return false;
  }
  const latest = (key: "cya" | "ch" | "salt") => n((readings ?? []).find((r) => r[key] !== null)?.[key]);

  const today = localDate(now, timeZone);
  const swg = pool.sanitizer === "swg";
  // Salt pools: hours a day the cell runs now, and the last setting logged. Missing tables
  // (before their migration) read as unknown.
  let cellHours: number | null = null;
  let cellSetting: number | null = null;
  if (swg) {
    const [{ data: schedule }, { data: setting }] = await Promise.all([
      admin
        .from("pump_schedules")
        .select("cell_hours")
        .eq("pool_id", poolId)
        .lte("effective_from", new Date(now).toISOString())
        .order("effective_from", { ascending: false })
        .limit(1)
        .maybeSingle<{ cell_hours: number | string }>(),
      admin
        .from("events")
        .select("value")
        .eq("pool_id", poolId)
        .eq("kind", "cell_setting")
        .order("occurred_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ value: number | string | null }>(),
    ]);
    cellHours = n(schedule?.cell_hours);
    cellSetting = n(setting?.value);
  }

  const [{ data: forecast, error: fErr }, { data: doses, error: dErr }, { data: model, error: mErr }] = await Promise.all([
    admin
      .from("weather_forecast")
      .select("date, uv_index_max, sunshine_s, shortwave_mj_m2, tmax_c, precipitation_mm")
      .eq("cell_id", pool.cell_id)
      .gte("date", today)
      .order("date")
      .limit(7)
      .returns<ForecastRow[]>(),
    admin
      .from("doses")
      .select("product_id, amount")
      .eq("pool_id", poolId)
      .gt("added_at", latestFc.taken_at)
      .returns<{ product_id: string; amount: number }[]>(),
    admin
      .from("pool_models")
      .select("coefficients, sample_count")
      .eq("pool_id", poolId)
      .maybeSingle<{ coefficients: unknown; sample_count: number }>(),
  ]);
  if (fErr || dErr || mErr) throw new Error(`inputs: ${(fErr ?? dErr ?? mErr)?.message}`);
  if (!forecast || forecast.length === 0) return false;

  const stored = model ? parseStoredCoefficients(model.coefficients) : null;
  let coefficients: Coefficients;
  let pairs = 0;
  if (stored) {
    coefficients = stored.coefficients;
    pairs = model?.sample_count ?? 0;
  } else {
    coefficients = (await loadPopulationPrior(admin, poolId)).mean;
  }

  const cya = latest("cya");
  const addedPpm = (doses ?? []).reduce((sum, d) => {
    try {
      return sum + (effectsOf(d.product_id, Number(d.amount), volumeL).fc ?? 0);
    } catch {
      return sum;
    }
  }, 0);
  // Today's rain at the pool, when the owner logged it, in place of the cell's forecast.
  const rows = withOwnRain(forecast, await loadOwnRain(admin, poolId, today));
  const days = rows.map((row) => ({ date: row.date, weather: weatherOf(row) }));
  const todayDrivers = dayDrivers(days[0].weather, { cya: cya ?? DEFAULT_CYA, covered: pool.covered, heavyUse: 0 });
  const daysSince = (now - Date.parse(latestFc.taken_at)) / DAY_MS;
  // FC now: the same day-by-day estimate the chart draws (weather, doses, the cell) when
  // it reaches now; otherwise the simple carry-forward from the last test.
  const series = (await loadPoolEstimate(admin, poolId, now))?.sinceLastTest ?? null;
  const reachedNow = series && series.length > 0 && Date.parse(series[series.length - 1].at) >= now - 60_000;
  const fcStart = reachedNow
    ? series[series.length - 1].fc
    : estimateStartFc({
        fc: Number(latestFc.fc),
        addedPpm,
        daysSince,
        dailyLossPpm: todayDrivers ? predictLoss(coefficients, todayDrivers) : 0,
        swg,
      });

  const lb = n(pool.swg_cell_lb_per_day);
  const plan = planWeek({
    coefficients,
    pairs,
    pool: {
      volumeL,
      surfaceAreaM2: n(pool.surface_area_m2),
      swg,
      covered: pool.covered,
      surface: pool.surface,
      // What the cell makes a day at 100% with the pump hours it runs now.
      cellPpmPerDay: swg && lb && lb > 0 && cellHours ? ((lb * GRAMS_PER_POUND * 1000) / volumeL) * (cellHours / 24) : null,
      // The settings the cell's own control offers (CircuPool CORE: 25/50/75/100%).
      cellLevels: cellLevels(pool.swg_cell_model),
    },
    water: { fc: fcStart, cya, ch: latest("ch"), salt: latest("salt") },
    days,
  });
  if (!plan) return false;

  const summary: StoredPlanSummary = {
    kind: plan.kind,
    fc: plan.fc,
    floor: plan.floor,
    swgPercent: plan.swgPercent,
    swgNeedPpm: plan.swgNeedPpm,
    capped: plan.capped,
    lowWithoutChlorine: plan.lowWithoutChlorine,
    confidence: plan.confidence,
    pairs: plan.pairs,
    fcStart,
    lastTestAt: latestFc.taken_at,
    daysSinceTest: Math.round(daysSince * 10) / 10,
    product: PRODUCT,
    cellHours,
    cellSetting,
    cellNeeds: !swg ? null : !(lb && lb > 0) ? "rating" : !cellHours ? "pump" : null,
  };
  const storedDays: StoredPlanDay[] = plan.days.map((d) => ({
    ...d,
    addMl: d.addPpm > 0 ? Math.round(doseFor(PRODUCT, d.addPpm, volumeL).amount) : 0,
  }));

  const { error: wErr } = await admin.from("plans").upsert(
    { pool_id: poolId, computed_at: new Date(now).toISOString(), version: plan.version, summary, days: storedDays },
    { onConflict: "pool_id" },
  );
  if (wErr) throw new Error(`plans upsert: ${wErr.message}`);
  return true;
}

/** One pool. Never throws. */
export async function refreshPlan(admin: SupabaseClient, poolId: string): Promise<boolean> {
  try {
    return await buildPlan(admin, poolId);
  } catch (err) {
    console.error(`[plan] pool ${poolId}: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

/** Every pool, for the nightly job after the forecast and models are updated. Never throws. */
export async function refreshAllPlans(admin: SupabaseClient): Promise<{ pools: number; planned: number }> {
  const result = { pools: 0, planned: 0 };
  try {
    const { data, error } = await admin.from("pools").select("id").returns<{ id: string }[]>();
    if (error) throw new Error(error.message);
    result.pools = data?.length ?? 0;
    for (const { id } of data ?? []) if (await refreshPlan(admin, id)) result.planned += 1;
  } catch (err) {
    console.error(`[plan] nightly: ${err instanceof Error ? err.message : String(err)}`);
  }
  return result;
}

/** Rebuilds the plan once the response has been sent (a stale plan on a page view). */
export function refreshPlanAfterResponse(poolId: string): void {
  after(async () => {
    await refreshPlan(createSupabaseAdminClient(), poolId);
  });
}
