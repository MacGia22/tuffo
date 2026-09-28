import {
  DEFAULT_CYA,
  dayDrivers,
  effectsOf,
  FEATURES,
  GRAMS_PER_POUND,
  type Drivers,
  type Observation,
  type WeatherDrivers,
} from "@/engine/server";

/**
 * Turns a pool's log into model observations: one per pair of consecutive tests with
 * free chlorine, with the loss per day and the mean weather and use drivers between
 * them. Pairs the model cannot learn from are kept with a reason, so the backtest and
 * the page can say how many were used.
 */

export interface ModelPool {
  volumeL: number;
  sanitizer: "chlorine" | "swg";
  covered: boolean;
  swgCellLbPerDay: number | null;
  timezone: string;
}

export interface ModelReading {
  taken_at: string;
  fc: number | null;
  cya: number | null;
}

export interface ModelDose {
  added_at: string;
  product_id: string;
  amount: number;
}

export interface ModelEvent {
  occurred_at: string;
  kind: string;
}

export interface ModelWeatherDay {
  date: string;
  uv_index_max: number | null;
  sunshine_s: number | null;
  shortwave_mj_m2: number | null;
  tmax_c: number | null;
  precipitation_mm: number | null;
}

export type SkipReason =
  | "short" // under 6 hours apart: test noise swamps the loss
  | "long" // over 10 days apart: chlorine likely ran out unseen
  | "bottomed" // the second test found almost no chlorine, so the loss is a lower bound
  | "refill" // water was replaced in between
  | "swg-unknown" // salt pool without the cell's daily output
  | "weather"; // not enough weather for the days in between

export interface TestPair {
  from: string;
  to: string;
  days: number;
  fcStart: number;
  fcEnd: number;
  /** Free chlorine added by logged doses (and the salt cell) in between, ppm. */
  addedPpm: number;
  drivers: Drivers | null;
  lossPerDay: number;
  skip: SkipReason | null;
}

const DAY_MS = 86_400_000;
const MIN_DAYS = 0.25;
const MAX_DAYS = 10;
const BOTTOMED_FC = 0.5;
const MIN_WEATHER_SHARE = 0.8;

function localParts(iso: string, timeZone: string): { date: string; dayFraction: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    dayFraction: (Number(get("hour")) + Number(get("minute")) / 60) / 24,
  };
}

function nextDate(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);
}

/** Local dates an interval touches, each with the share of that day inside the interval. */
export function dayShares(fromIso: string, toIso: string, timeZone: string): { date: string; share: number }[] {
  const start = localParts(fromIso, timeZone);
  const end = localParts(toIso, timeZone);
  if (start.date === end.date) return [{ date: start.date, share: Math.max(0, end.dayFraction - start.dayFraction) }];
  const out = [{ date: start.date, share: 1 - start.dayFraction }];
  let date = nextDate(start.date);
  for (let guard = 0; date < end.date && guard < 400; guard += 1) {
    out.push({ date, share: 1 });
    date = nextDate(date);
  }
  out.push({ date: end.date, share: end.dayFraction });
  return out.filter((d) => d.share > 0);
}

function weatherDrivers(day: ModelWeatherDay): WeatherDrivers {
  const n = (v: number | null) => (v === null || v === undefined ? null : Number(v));
  return {
    uvIndexMax: n(day.uv_index_max),
    sunshineHours: day.sunshine_s === null || day.sunshine_s === undefined ? null : Number(day.sunshine_s) / 3600,
    shortwaveMj: n(day.shortwave_mj_m2),
    tmaxC: n(day.tmax_c),
    rainMm: n(day.precipitation_mm),
  };
}

function fcAdded(dose: ModelDose, liters: number): number {
  try {
    return effectsOf(dose.product_id, Number(dose.amount), liters).fc ?? 0;
  } catch {
    return 0;
  }
}

/** Salt-cell output in ppm of free chlorine per day, or null when it is not known. */
export function cellPpmPerDay(pool: ModelPool): number | null {
  if (pool.sanitizer !== "swg") return 0;
  if (!pool.swgCellLbPerDay || pool.swgCellLbPerDay <= 0) return null;
  return (pool.swgCellLbPerDay * GRAMS_PER_POUND * 1000) / pool.volumeL;
}

function coverAt(atMs: number, pool: ModelPool, events: ModelEvent[]): boolean {
  let covered = pool.covered;
  let latest = -Infinity;
  for (const e of events) {
    const t = Date.parse(e.occurred_at);
    if (t <= atMs && t > latest && (e.kind === "cover_on" || e.kind === "cover_off")) {
      latest = t;
      covered = e.kind === "cover_on";
    }
  }
  return covered;
}

function cyaAt(atMs: number, readings: ModelReading[]): number {
  let cya: number | null = null;
  let latest = -Infinity;
  for (const r of readings) {
    const t = Date.parse(r.taken_at);
    if (r.cya !== null && t <= atMs && t > latest) {
      latest = t;
      cya = Number(r.cya);
    }
  }
  return cya ?? DEFAULT_CYA;
}

/** Test pairs in time order, oldest first. */
export function buildTestPairs(input: {
  pool: ModelPool;
  readings: ModelReading[];
  doses: ModelDose[];
  events: ModelEvent[];
  weather: ModelWeatherDay[];
}): TestPair[] {
  const { pool, doses, events } = input;
  const withFc = input.readings
    .filter((r) => r.fc !== null)
    .sort((a, b) => Date.parse(a.taken_at) - Date.parse(b.taken_at));
  const weatherByDate = new Map(input.weather.map((w) => [w.date, weatherDrivers(w)]));
  const cell = cellPpmPerDay(pool);
  const pairs: TestPair[] = [];

  for (let i = 1; i < withFc.length; i += 1) {
    const a = withFc[i - 1];
    const b = withFc[i];
    const t0 = Date.parse(a.taken_at);
    const t1 = Date.parse(b.taken_at);
    const days = (t1 - t0) / DAY_MS;
    const inside = (iso: string) => {
      const t = Date.parse(iso);
      return t > t0 && t <= t1;
    };

    const dosed = doses.filter((d) => inside(d.added_at)).reduce((sum, d) => sum + fcAdded(d, pool.volumeL), 0);
    const addedPpm = dosed + (cell ?? 0) * Math.max(days, 0);
    const fcStart = Number(a.fc);
    const fcEnd = Number(b.fc);
    const lossPerDay = days > 0 ? (fcStart + addedPpm - fcEnd) / days : 0;
    const between = events.filter((e) => inside(e.occurred_at));

    let skip: SkipReason | null = null;
    if (days < MIN_DAYS) skip = "short";
    else if (days > MAX_DAYS) skip = "long";
    else if (cell === null) skip = "swg-unknown";
    else if (between.some((e) => e.kind === "refill" || e.kind === "drain_refill")) skip = "refill";
    else if (fcEnd < BOTTOMED_FC) skip = "bottomed";

    let drivers: Drivers | null = null;
    if (days >= MIN_DAYS && days <= MAX_DAYS) {
      const state = { cya: cyaAt(t1, input.readings), covered: coverAt(t0, pool, events), heavyUse: 0 };
      const shares = dayShares(a.taken_at, b.taken_at, pool.timezone);
      const total = shares.reduce((sum, s) => sum + s.share, 0);
      const sums = Object.fromEntries(FEATURES.map((f) => [f, 0])) as Drivers;
      let covered = 0;
      for (const { date, share } of shares) {
        const day = weatherByDate.get(date);
        const d = day ? dayDrivers(day, state) : null;
        if (!d) continue;
        covered += share;
        for (const f of FEATURES) sums[f] += d[f] * share;
      }
      if (total > 0 && covered / total >= MIN_WEATHER_SHARE) {
        drivers = Object.fromEntries(FEATURES.map((f) => [f, sums[f] / covered])) as Drivers;
        drivers.use = between.filter((e) => e.kind === "heavy_use").length / days;
      } else if (!skip) {
        skip = "weather";
      }
    }

    pairs.push({ from: a.taken_at, to: b.taken_at, days, fcStart, fcEnd, addedPpm, drivers, lossPerDay, skip });
  }
  return pairs;
}

/** The pairs the model can learn from. */
export function observationsFrom(pairs: TestPair[]): Observation[] {
  return pairs
    .filter((p): p is TestPair & { drivers: Drivers } => p.skip === null && p.drivers !== null)
    .map((p) => ({ drivers: p.drivers, lossPerDay: p.lossPerDay, days: p.days }));
}
