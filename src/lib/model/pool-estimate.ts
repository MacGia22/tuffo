import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_PRIOR, parseStoredCoefficients } from "@/engine/server";
import { loadOwnRain, withOwnRain } from "@/lib/weather/own-rain";
import {
  estimateFcSeries,
  expectationsAtTests,
  typicalMiss,
  type EstimatePoint,
  type Expectation,
} from "./estimate";
import type { ModelDose, ModelEvent, ModelPool, ModelPumpSchedule, ModelReading, ModelWeatherDay } from "./observations";

/**
 * The pool page's estimate: free chlorine from the last test to now, and what Tuffo
 * expected at each recent test, from the pool's fitted model (or typical-pool numbers
 * before it has one). Loaded with the service key; only the numbers leave the server.
 * Fails open: any error gives null and the chart simply has no estimate.
 */

export interface PoolEstimate {
  /** From the last test with free chlorine to now; null when it cannot be worked out. */
  sinceLastTest: EstimatePoint[] | null;
  expectations: Expectation[];
  miss: { ppm: number; count: number } | null;
}

const DAY_MS = 86_400_000;
/** Tests looked at for the comparison: the chart's window and a little before it. */
const LOOKBACK_DAYS = 40;

interface PoolRow {
  volume_l: number | string;
  sanitizer: "chlorine" | "swg";
  covered: boolean;
  swg_cell_lb_per_day: number | string | null;
  timezone: string | null;
  cell_id: string | null;
}

export async function loadPoolEstimate(admin: SupabaseClient, poolId: string, now = Date.now()): Promise<PoolEstimate | null> {
  try {
    const since = new Date(now - LOOKBACK_DAYS * DAY_MS).toISOString();
    const [{ data: pool }, { data: readings }, { data: doses }, { data: events }, { data: model }] = await Promise.all([
      admin
        .from("pools")
        .select("volume_l, sanitizer, covered, swg_cell_lb_per_day, timezone, cell_id")
        .eq("id", poolId)
        .maybeSingle<PoolRow>(),
      admin
        .from("readings")
        .select("taken_at, fc, cya")
        .eq("pool_id", poolId)
        .gte("taken_at", since)
        // The newest 500: a monitor logging often must not lose its latest tests.
        .order("taken_at", { ascending: false })
        .limit(500)
        .returns<ModelReading[]>(),
      admin
        .from("doses")
        .select("added_at, product_id, amount")
        .eq("pool_id", poolId)
        .gte("added_at", since)
        .limit(1000)
        .returns<ModelDose[]>(),
      admin
        .from("events")
        .select("occurred_at, kind, value")
        .eq("pool_id", poolId)
        // Cell settings from any time: the one in force at the start still counts.
        .or(`occurred_at.gte.${since},kind.eq.cell_setting`)
        .limit(1000)
        .returns<ModelEvent[]>(),
      admin.from("pool_models").select("coefficients").eq("pool_id", poolId).maybeSingle<{ coefficients: unknown }>(),
    ]);
    if (!pool) return null;
    // The stabilizer test in force at the start of the window, however old: it sets the use.
    const { data: olderCya } = await admin
      .from("readings")
      .select("taken_at, cya")
      .eq("pool_id", poolId)
      .lt("taken_at", since)
      .not("cya", "is", null)
      .order("taken_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ taken_at: string; cya: number }>();
    const allReadings: ModelReading[] = [
      ...(olderCya ? [{ taken_at: olderCya.taken_at, fc: null, cya: olderCya.cya }] : []),
      ...(readings ?? []),
    ];
    const timezone = pool.timezone ?? "UTC";
    const modelPool: ModelPool = {
      volumeL: Number(pool.volume_l),
      sanitizer: pool.sanitizer,
      covered: pool.covered,
      swgCellLbPerDay: pool.swg_cell_lb_per_day === null ? null : Number(pool.swg_cell_lb_per_day),
      timezone,
    };
    const coefficients = (model ? parseStoredCoefficients(model.coefficients)?.coefficients : null) ?? DEFAULT_PRIOR.mean;

    let weather: ModelWeatherDay[] = [];
    if (pool.cell_id) {
      const from = since.slice(0, 10);
      const select = "date, uv_index_max, sunshine_s, shortwave_mj_m2, tmax_c, precipitation_mm";
      const [{ data: daily }, { data: ahead }, own] = await Promise.all([
        admin.from("weather_daily").select(select).eq("cell_id", pool.cell_id).gte("date", from).returns<ModelWeatherDay[]>(),
        // Today is still a forecast until tomorrow's refresh.
        admin
          .from("weather_forecast")
          .select(select)
          .eq("cell_id", pool.cell_id)
          .gte("date", new Date(now - DAY_MS).toISOString().slice(0, 10))
          .lte("date", new Date(now + DAY_MS).toISOString().slice(0, 10))
          .returns<ModelWeatherDay[]>(),
        loadOwnRain(admin, poolId, from),
      ]);
      const byDate = new Map<string, ModelWeatherDay>();
      for (const w of ahead ?? []) byDate.set(w.date, w);
      for (const w of daily ?? []) byDate.set(w.date, w);
      weather = withOwnRain([...byDate.values()], own);
    }

    let pumpSchedules: ModelPumpSchedule[] = [];
    if (pool.sanitizer === "swg") {
      const { data } = await admin
        .from("pump_schedules")
        .select("effective_from, cell_hours")
        .eq("pool_id", poolId)
        .order("effective_from")
        .limit(500)
        .returns<ModelPumpSchedule[]>();
      pumpSchedules = data ?? [];
    }

    const input = { pool: modelPool, coefficients, readings: allReadings, doses: doses ?? [], events: events ?? [], weather, pumpSchedules };
    const tests = allReadings
      .filter((r) => r.fc !== null)
      .map((r) => ({ at: r.taken_at, fc: Number(r.fc) }))
      .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    const last = tests[tests.length - 1];
    const sinceLastTest = last ? estimateFcSeries({ ...input, start: last, end: new Date(now).toISOString() }) : null;
    const expectations = expectationsAtTests(input, tests);
    return { sinceLastTest, expectations, miss: typicalMiss(expectations) };
  } catch (err) {
    console.error(`[estimate] pool ${poolId}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
