import { cellPpmBetween, dayDrivers, predictLoss, type Coefficients } from "@/engine/server";
import { instantInZone } from "@/lib/form-data";
import {
  cellPpmPerDay,
  coverAt,
  cyaAt,
  dayShares,
  fcAdded,
  weatherDrivers,
  type ModelDose,
  type ModelEvent,
  type ModelPool,
  type ModelPumpSchedule,
  type ModelReading,
  type ModelWeatherDay,
} from "./observations";

/**
 * What free chlorine has probably done since a test, replayed with the pool's model:
 * each day's predicted use under that day's actual weather, the doses logged and what the
 * salt cell made at the settings and pump hours in force. Used for the dotted "estimated"
 * line from the last test to now, and to show what Tuffo expected at each new test.
 *
 * Server-only (it runs the engine); the page receives the numbers, never coefficients.
 */

export interface EstimatePoint {
  at: string;
  fc: number;
}

/** Past this, an unseen stretch is guesswork: the estimate stops. */
export const MAX_ESTIMATE_DAYS = 10;

const DAY_MS = 86_400_000;

export interface EstimateInput {
  pool: ModelPool;
  coefficients: Coefficients;
  start: { at: string; fc: number };
  end: string;
  readings: ModelReading[];
  doses: ModelDose[];
  events: ModelEvent[];
  weather: ModelWeatherDay[];
  pumpSchedules?: ModelPumpSchedule[];
}

/**
 * Local midnights strictly between two instants, as instants: the real start of each
 * local day, so a 23- or 25-hour day across a daylight-saving change ends where it should.
 */
function midnights(fromMs: number, toMs: number, timeZone: string): number[] {
  const shares = dayShares(new Date(fromMs).toISOString(), new Date(toMs).toISOString(), timeZone);
  return shares
    .slice(1)
    .map((s) => {
      const r = instantInZone(`${s.date}T00:00`, timeZone, Infinity);
      return r.ok && r.iso ? Date.parse(r.iso) : NaN;
    })
    .filter((t) => t > fromMs && t < toMs);
}

/**
 * The estimated free chlorine from `start` to `end`: a point at the start, at each local
 * midnight, just before and after each logged dose, and at the end. Null when it cannot
 * be worked out: a salt pool whose cell output is not known, a refill in between, or no
 * time to cover. Stops after MAX_ESTIMATE_DAYS.
 */
export function estimateFcSeries(input: EstimateInput): EstimatePoint[] | null {
  const { pool, coefficients } = input;
  const t0 = Date.parse(input.start.at);
  const t1 = Math.min(Date.parse(input.end), t0 + MAX_ESTIMATE_DAYS * DAY_MS);
  if (!(t1 > t0)) return null;
  // Anything logged at the test's own moment came after it (test, then dose).
  const inside = (iso: string) => {
    const t = Date.parse(iso);
    return t >= t0 && t <= t1;
  };
  // No estimate across a refill; one logged with the next test came after that test.
  const refilled = input.events.some(
    (e) => (e.kind === "refill" || e.kind === "drain_refill") && inside(e.occurred_at) && Date.parse(e.occurred_at) < t1,
  );
  if (refilled) return null;

  const cell = cellPpmPerDay(pool);
  if (cell === null) return null;
  const settings = input.events
    .filter((e) => e.kind === "cell_setting" && e.value !== null && e.value !== undefined)
    .map((e) => ({ at: e.occurred_at, value: Number(e.value) }));
  const hours = (input.pumpSchedules ?? []).map((s) => ({ at: s.effective_from, value: Number(s.cell_hours) }));

  // Daily use for each local date: the model under that day's weather; a day with no
  // weather takes the average of the days that have it (or the base use alone).
  const cya = cyaAt(t0, input.readings);
  const covered = coverAt(t0, pool, input.events);
  const weatherByDate = new Map(input.weather.map((w) => [w.date, weatherDrivers(w)]));
  // A heavy-use event costs its full share (the fit's "use" per event) when it happens,
  // not spread over its day, so a party an hour after a test counts whole.
  const busy = input.events
    .filter((e) => e.kind === "heavy_use" && inside(e.occurred_at))
    .map((e) => ({ t: Date.parse(e.occurred_at), ppm: -Math.max(0, coefficients.use) }));
  const known = new Map<string, number>();
  for (const { date } of dayShares(new Date(t0).toISOString(), new Date(t1).toISOString(), pool.timezone)) {
    const day = weatherByDate.get(date);
    const drivers = day ? dayDrivers(day, { cya, covered, heavyUse: 0 }) : null;
    if (drivers) known.set(date, predictLoss(coefficients, drivers));
  }
  const fallback = known.size
    ? [...known.values()].reduce((a, b) => a + b, 0) / known.size
    : Math.max(0, coefficients.base);
  const dailyLoss = (date: string) => known.get(date) ?? fallback;

  const doses = [
    ...input.doses
      .filter((d) => inside(d.added_at))
      .map((d) => ({ t: Date.parse(d.added_at), ppm: fcAdded(d, pool.volumeL) }))
      .filter((d) => d.ppm > 0),
    ...busy,
  ];
  const breaks = [...new Set([...midnights(t0, t1, pool.timezone), ...doses.map((d) => d.t), t1])]
    .filter((t) => t > t0 && t <= t1)
    .sort((a, b) => a - b);

  const round = (v: number) => Math.round(v * 100) / 100;
  let fc = Math.max(0, input.start.fc);
  let at = t0;
  const points: EstimatePoint[] = [{ at: new Date(t0).toISOString(), fc: round(fc) }];
  // A dose logged at the test's own moment: on top of the test.
  const atStart = doses.filter((d) => d.t === t0).reduce((sum, d) => sum + d.ppm, 0);
  if (atStart !== 0) {
    fc = Math.max(0, fc + atStart);
    points.push({ at: new Date(t0).toISOString(), fc: round(fc) });
  }
  for (const t of breaks) {
    const from = new Date(at).toISOString();
    const to = new Date(t).toISOString();
    const used = dayShares(from, to, pool.timezone).reduce((sum, s) => sum + s.share * dailyLoss(s.date), 0);
    let made = 0;
    if (pool.sanitizer === "swg") {
      const m = cellPpmBetween({ ratedPpmPerDay: cell, settings, hours, from, to });
      if (m === null) return null;
      made = m;
    }
    fc = Math.max(0, fc + made - used);
    points.push({ at: to, fc: round(fc) });
    const added = doses.filter((d) => d.t === t).reduce((sum, d) => sum + d.ppm, 0);
    if (added !== 0) {
      fc = Math.max(0, fc + added);
      points.push({ at: to, fc: round(fc) });
    }
    at = t;
  }
  return points;
}

export interface Expectation {
  /** When the test was taken. */
  at: string;
  /** What the estimate from the previous test said at that moment, ppm. */
  expected: number;
  measured: number;
}

/**
 * For each test with free chlorine, what Tuffo expected from the test before it, when the
 * stretch in between can be estimated. Oldest first.
 */
export function expectationsAtTests(
  input: Omit<EstimateInput, "start" | "end">,
  tests: { at: string; fc: number }[],
): Expectation[] {
  const sorted = [...tests].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const out: Expectation[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const a = sorted[i - 1];
    const b = sorted[i];
    if (Date.parse(b.at) - Date.parse(a.at) > MAX_ESTIMATE_DAYS * DAY_MS) continue;
    const series = estimateFcSeries({ ...input, start: a, end: b.at });
    // A dose logged at the same moment as the test came after it: compare before the dose.
    const last = series?.filter((p) => p.at === new Date(Date.parse(b.at)).toISOString())[0];
    if (!last) continue;
    out.push({ at: b.at, expected: last.fc, measured: b.fc });
  }
  return out;
}

/** Mean size of the miss over the last few comparisons, ppm; null with fewer than two. */
export function typicalMiss(expectations: Expectation[], last = 5): { ppm: number; count: number } | null {
  const recent = expectations.slice(-last);
  if (recent.length < 2) return null;
  const ppm = recent.reduce((sum, e) => sum + Math.abs(e.measured - e.expected), 0) / recent.length;
  return { ppm: Math.round(ppm * 10) / 10, count: recent.length };
}
