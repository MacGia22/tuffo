import "server-only";

import { notFound } from "next/navigation";
import { after } from "next/server";
import { effectsOf, PLAN_OWN_MODEL_PAIRS } from "@/engine/server";
import type { ActivityItem } from "@/components/activity-list";
import { planAddLabel } from "@/lib/plan/add-label";
import { canSeePlan } from "@/lib/entitlements";
import { refreshPlanAfterResponse } from "@/lib/plan/build";
import { cellPercentOn, parseStoredPlan, planHasFcLine, planIsStale, type StoredPlan } from "@/lib/plan/stored";
import { adviseFor } from "@/lib/advice";
import { catalogProduct } from "@/lib/catalog";
import { baseToShelf, formatShelf, type BaseUnit } from "@/lib/dose-format";
import { describeEvent } from "@/lib/events";
import { formatDateTime, formatDay, type Units } from "@/lib/format";
import { loadPoolEstimate } from "@/lib/model/pool-estimate";
import { chlorineUse } from "@/lib/model/usage";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { retryAllOnClockSkew } from "@/lib/supabase/retry";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildTrend, DAYS_AHEAD, rangeLookbackDays, rangeStart, type TrendRange } from "@/lib/trends";
import { FRESH_HOURS, refreshCellIfStale } from "@/lib/weather/job";
import { loadOwnRain, withOwnRain } from "@/lib/weather/own-rain";
import { localDateRange, summarizeBetween, type WeatherDay } from "@/lib/weather/summary";

/**
 * Everything a pool's pages show, loaded and shaped per request: the Today page and the
 * Trends page share it. Model coefficients stay here; only advice and numbers leave.
 */

export interface Pool {
  id: string;
  name: string;
  volume_l: number;
  sanitizer: "chlorine" | "swg";
  surface: "plaster" | "vinyl" | "fiberglass";
  covered: boolean;
  cell_id: string | null;
  place_label: string | null;
  timezone: string | null;
  swg_cell_lb_per_day: number | null;
  swg_cell_model: string | null;
}

export interface Reading {
  id: string;
  taken_at: string;
  fc: number | null;
  cc: number | null;
  ph: number | null;
  ta: number | null;
  ch: number | null;
  cya: number | null;
  salt: number | null;
  water_temp_c: number | null;
  borate: number | null;
  method: string;
}

export interface Dose {
  id: string;
  added_at: string;
  product_id: string;
  amount: number;
  unit: BaseUnit;
  notes: string | null;
}

export interface PoolEvent {
  id: string;
  occurred_at: string;
  kind: string;
  value: number | null;
  notes: string | null;
}

/**
 * The pool's learned chlorine use. pool_models is server-only, so it is read with the
 * service key, and only after the signed-in user's own query has returned the pool.
 * Fails open: the page shows without it.
 */
async function loadChlorineUse(poolId: string, cya: number | null, covered: boolean) {
  try {
    const { data } = await createSupabaseAdminClient()
      .from("pool_models")
      .select("coefficients, sample_count")
      .eq("pool_id", poolId)
      .maybeSingle<{ coefficients: unknown; sample_count: number }>();
    return chlorineUse(data ?? null, { cya, covered });
  } catch (err) {
    console.error(`[model] read ${poolId}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

interface WeatherRow extends WeatherDay {
  date: string;
}

const DAY_MS = 86_400_000;

export function doseLabel(dose: Dose, units: Units): string {
  const shelf = baseToShelf(Number(dose.amount), dose.unit, units);
  const name = catalogProduct(dose.product_id)?.short ?? dose.product_id;
  return `${shelf.value > 0 ? formatShelf(shelf.value, shelf.unit) : "a little"} of ${name}`;
}

/** Free chlorine a dose adds to this pool, ppm (0 for products that do not add chlorine). */
function fcAddedBy(dose: Dose, liters: number): number {
  try {
    return effectsOf(dose.product_id, Number(dose.amount), liters).fc ?? 0;
  } catch {
    return 0;
  }
}

/** Everything the pool page shows, loaded and shaped per request. */
export async function loadPoolView(id: string, range: TrendRange, options: { trend?: boolean } = {}) {
  const now = Date.now();
  // Rows a little before the chart's window (the season can reach back to January).
  // At least 40 days, for the tiles' retest dates and the doses of the last week.
  const lookbackDays = Math.max(40, rangeLookbackDays(range));
  const since = new Date(now - lookbackDays * DAY_MS).toISOString();
  const supabase = await createSupabaseServerClient();
  const [{ data: pool }, { data: readings }, { data: doses }, { data: events }, { data: profile }] =
    await retryAllOnClockSkew(() =>
      Promise.all([
        supabase.from("pools").select("*").eq("id", id).maybeSingle<Pool>(),
        supabase
          .from("readings")
          .select("id, taken_at, fc, cc, ph, ta, ch, cya, salt, water_temp_c, borate, method")
          .eq("pool_id", id)
          .order("taken_at", { ascending: false })
          .limit(lookbackDays > 60 ? 1000 : 100)
          .returns<Reading[]>(),
        supabase
          .from("doses")
          .select("id, added_at, product_id, amount, unit, notes")
          .eq("pool_id", id)
          .gte("added_at", since)
          .order("added_at", { ascending: false })
          .limit(200)
          .returns<Dose[]>(),
        supabase
          .from("events")
          .select("id, occurred_at, kind, value, notes")
          .eq("pool_id", id)
          .gte("occurred_at", since)
          .order("occurred_at", { ascending: false })
          .limit(100)
          .returns<PoolEvent[]>(),
        supabase.from("profiles").select("units").maybeSingle<{ units: Units }>(),
      ]),
    );
  if (!pool) notFound();

  const units = profile?.units ?? "us";
  const tz = pool.timezone ?? "UTC";
  const liters = Number(pool.volume_l);
  const allReadings = readings ?? [];
  const allDoses = doses ?? [];
  const allEvents = events ?? [];
  const latest = allReadings[0];
  const previous = allReadings[1];
  const latestCya = allReadings.find((r) => r.cya !== null)?.cya ?? null;
  // The chart's first day for the chosen range.
  const yearStart = `${localDateRange(new Date(now).toISOString(), new Date(now).toISOString(), tz).to.slice(0, 4)}-01-01`;
  const firstThisYear =
    [...allReadings]
      .filter((r) => localDateRange(r.taken_at, r.taken_at, tz).to >= yearStart)
      .sort((a, b) => Date.parse(a.taken_at) - Date.parse(b.taken_at))[0]?.taken_at ?? null;
  const windowStart = rangeStart(range, now, tz, firstThisYear);
  const [use, estimate] = await Promise.all([
    loadChlorineUse(pool.id, latestCya === null ? null : Number(latestCya), pool.covered),
    // Estimated FC since the last test and what Tuffo expected at recent tests; fails open.
    loadPoolEstimate(createSupabaseAdminClient(), pool.id, now),
  ]);
  const today = localDateRange(new Date(now).toISOString(), new Date(now).toISOString(), tz).to;

  // The 7-day plan, written by the server. A missing or old one is rebuilt after the
  // response, so the next visit has it; the page never waits for it.
  let plan: StoredPlan | null = null;
  if (await canSeePlan()) {
    const { data: planRow } = await supabase
      .from("plans")
      .select("computed_at, version, summary, days")
      .eq("pool_id", pool.id)
      .maybeSingle<{ computed_at: string; version: number; summary: unknown; days: unknown }>();
    plan = parseStoredPlan(planRow ?? null);
    const latestFcAt = allReadings.find((r) => r.fc !== null)?.taken_at ?? null;
    if (pool.cell_id && latestFcAt && planIsStale(plan, latestFcAt, now)) refreshPlanAfterResponse(pool.id);
  }

  const ownModel = Math.max(use?.pairs ?? 0, plan?.summary.pairs ?? 0) >= PLAN_OWN_MODEL_PAIRS;

  // Weather for the chart window (and the between-tests box), plus today's forecast.
  let weather: Array<WeatherRow & { ownRain: boolean }> = [];
  let forecastDays: WeatherRow[] = [];
  let lastActualsAt: string | null = null;
  if (pool.cell_id) {
    const [{ data: daily }, { data: forecast }, { data: cellRow }, ownRain] = await Promise.all([
      supabase
        .from("weather_daily")
        .select("date, tmax_c, tmin_c, uv_index_max, sunshine_s, precipitation_mm")
        .eq("cell_id", pool.cell_id)
        .gte("date", windowStart)
        .order("date")
        .returns<WeatherRow[]>(),
      supabase
        .from("weather_forecast")
        .select("date, tmax_c, tmin_c, uv_index_max, sunshine_s, precipitation_mm, precipitation_probability")
        .eq("cell_id", pool.cell_id)
        .gte("date", today)
        .order("date")
        .limit(DAYS_AHEAD + 1)
        .returns<WeatherRow[]>(),
      supabase
        .from("weather_cells")
        .select("last_actuals_at")
        .eq("id", pool.cell_id)
        .maybeSingle<{ last_actuals_at: string | null }>(),
      loadOwnRain(supabase, pool.id, windowStart),
    ]);
    forecastDays = forecast ?? [];
    const rows = daily ?? [];
    const todayForecast = forecastDays.find((w) => w.date === today);
    if (todayForecast && !rows.some((w) => w.date === today)) rows.push(todayForecast);
    // The owner's rain at the pool, where logged, in place of the cell's.
    weather = withOwnRain(rows, ownRain);
    lastActualsAt = cellRow?.last_actuals_at ?? null;

    // The nightly job keeps cells fresh; if it has not run for this one, refresh it
    // after the response so the next visit has the weather.
    if (!lastActualsAt || now - Date.parse(lastActualsAt) > FRESH_HOURS * 3_600_000) {
      const cellId = pool.cell_id;
      after(() => refreshCellIfStale(createSupabaseAdminClient(), cellId));
    }
  }

  let between = null;
  if (latest && previous) {
    const range = localDateRange(previous.taken_at, latest.taken_at, tz);
    const inRange = weather.filter((w) => w.date >= range.from && w.date <= range.to);
    const t0 = Date.parse(previous.taken_at);
    const t1 = Date.parse(latest.taken_at);
    const dosesBetween = allDoses.filter((d) => Date.parse(d.added_at) > t0 && Date.parse(d.added_at) <= t1);
    const fcAddedPpm = dosesBetween.reduce((sum, d) => sum + fcAddedBy(d, liters), 0);
    const notes = allEvents
      .filter((e) => Date.parse(e.occurred_at) > t0 && Date.parse(e.occurred_at) <= t1)
      .filter((e) => e.kind === "refill" || e.kind === "drain_refill" || e.kind === "heavy_use")
      .reverse()
      .map(
        (e) =>
          `${describeEvent(e.kind, e.value === null ? null : Number(e.value), units)}, ${formatDateTime(e.occurred_at, tz)}`,
      );
    between = summarizeBetween(previous, latest, inRange, { fcAddedPpm, notes });
  }

  const dosesSinceTest = latest
    ? allDoses
        .filter((d) => Date.parse(d.added_at) > Date.parse(latest.taken_at))
        .reverse()
        .map((d) => {
          const shelf = baseToShelf(Number(d.amount), d.unit, units);
          return {
            productId: d.product_id,
            amount: Number(d.amount),
            amountText: shelf.value > 0 ? formatShelf(shelf.value, shelf.unit) : "a little",
            dateText: formatDay(d.added_at, tz),
          };
        })
    : [];

  const advice = latest
    ? adviseFor(
        { volumeL: liters, sanitizer: pool.sanitizer, surface: pool.surface },
        {
          fc: latest.fc,
          cc: latest.cc,
          ph: latest.ph,
          ta: latest.ta,
          ch: latest.ch,
          cya: latest.cya,
          salt: latest.salt,
          waterTempC: latest.water_temp_c,
          borate: latest.borate,
        },
        dosesSinceTest,
        // Salt pools: the plan's cell setting, or a prompt for the cell's rating.
        pool.sanitizer === "swg"
          ? pool.swg_cell_lb_per_day === null
            ? { percent: null, needPpm: plan?.summary.swgNeedPpm ?? null, missing: "rating" as const }
            : plan?.summary.cellNeeds === "pump"
              ? { percent: null, needPpm: plan.summary.swgNeedPpm, missing: "pump" as const }
              : plan
                ? { percent: cellPercentOn(plan.summary, today), needPpm: plan.summary.swgNeedPpm }
                : undefined
          : undefined,
      )
    : null;

  // The estimate ribbon: the pool's typical miss spread over the usual days between tests
  // once it has its own model, else 0.1 ppm a day.
  const fcTimes = allReadings.filter((r) => r.fc !== null).map((r) => Date.parse(r.taken_at)).slice(0, 10);
  const gaps = fcTimes.slice(1).map((t, i) => (fcTimes[i] - t) / DAY_MS).sort((a, b) => a - b);
  const typicalGap = gaps.length ? Math.max(1, gaps[Math.floor(gaps.length / 2)]) : null;
  const miss = ownModel ? (estimate?.miss ?? null) : null;
  const spreadPerDay = miss && typicalGap ? Math.round((miss.ppm / typicalGap) * 100) / 100 : 0.1;

  const trend =
    options.trend !== false && (allReadings.length > 0 || weather.length > 0 || forecastDays.length > 0)
      ? buildTrend({
          timeZone: tz,
          start: windowStart,
          now,
          units,
          readings: allReadings.map((r) => ({ taken_at: r.taken_at, fc: r.fc, ph: r.ph })),
          estimate: estimate?.sinceLastTest ?? null,
          estimateSpreadPerDay: spreadPerDay,
          // Expected-vs-measured only once the pool has its own model (4 test pairs).
          expected: ownModel ? (estimate?.expectations ?? []) : [],
          // Doses and events, as the markers along the bottom of the chlorine panel.
          doses: [
            ...allDoses.map((d) => ({ added_at: d.added_at, label: `Added ${doseLabel(d, units)}` })),
            ...allEvents.map((e) => ({
              added_at: e.occurred_at,
              label: describeEvent(e.kind, e.value === null ? null : Number(e.value), units),
            })),
          ],
          weather: weather.map((w) => ({
            date: w.date,
            uv_index_max: w.uv_index_max,
            precipitation_mm: w.precipitation_mm,
            tmax_c: w.tmax_c,
            ownRain: w.ownRain,
          })),
          forecastWeather: forecastDays,
          fcBand: advice
            ? { low: advice.targets.fc.targetLow, high: advice.targets.fc.targetHigh }
            : { low: 3, high: 5 },
          fcMin: advice?.targets.fc.min ?? null,
          phBand: { low: 7.2, high: 7.8 },
          // A salt pool's plan without the cell's output has no meaningful FC line.
          plan:
            plan && planHasFcLine(plan.summary)
              ? {
                  continuous: plan.summary.kind === "swg",
                  days: plan.days.map((d) => {
                    const add = planAddLabel(d, units);
                    const w = forecastDays.find((f) => f.date === d.date);
                    return {
                      date: d.date,
                      fcAfterAdd: d.fcAfterAdd,
                      fcEnd: d.fcEnd,
                      add: add ? `${add} of liquid chlorine` : null,
                      uv_index_max: w?.uv_index_max ?? null,
                      precipitation_mm: w?.precipitation_mm ?? d.rainMm,
                    };
                  }),
                }
              : null,
        })
      : null;

  const activity: ActivityItem[] = [
    ...allDoses.map((d) => ({
      id: d.id,
      kind: "dose" as const,
      at: d.added_at,
      when: formatDateTime(d.added_at, tz),
      text: `Added ${doseLabel(d, units)}`,
      notes: d.notes,
    })),
    ...allEvents.map((e) => ({
      id: e.id,
      kind: "event" as const,
      at: e.occurred_at,
      when: formatDateTime(e.occurred_at, tz),
      text: describeEvent(e.kind, e.value === null ? null : Number(e.value), units),
      notes: e.notes,
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 15);

  // Salt pools: the setting and pump hours in force now.
  let saltStatus: { setting: number | null; settingSince: string | null; cellHours: number | null } | null = null;
  if (pool.sanitizer === "swg") {
    const [{ data: setting }, { data: schedule }] = await Promise.all([
      supabase
        .from("events")
        .select("value, occurred_at")
        .eq("pool_id", pool.id)
        .eq("kind", "cell_setting")
        .order("occurred_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ value: number | null; occurred_at: string }>(),
      supabase
        .from("pump_schedules")
        .select("cell_hours")
        .eq("pool_id", pool.id)
        .order("effective_from", { ascending: false })
        .limit(1)
        .maybeSingle<{ cell_hours: number | string }>(),
    ]);
    saltStatus = {
      setting: setting?.value === null || setting?.value === undefined ? null : Number(setting.value),
      settingSince: setting?.occurred_at ? formatDay(setting.occurred_at, tz) : null,
      cellHours: schedule ? Number(schedule.cell_hours) : null,
    };
  }

  const estimateMiss = ownModel ? (estimate?.miss ?? null) : null;
  return {
    pool,
    units,
    tz,
    liters,
    allReadings,
    allDoses,
    allEvents,
    forecastDays,
    previous,
    latest,
    advice,
    between,
    use,
    trend,
    activity,
    plan,
    today,
    saltStatus,
    estimateMiss,
    now,
  };
}
