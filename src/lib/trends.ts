import type { Units } from "@/lib/format";

/**
 * Shapes a pool's tests, doses and daily weather into the data the trend chart
 * draws. Everything is placed on the pool's own calendar (its timezone), with x
 * measured in days from the start of the window: day i spans [i, i + 1).
 */

export interface TrendDay {
  date: string; // YYYY-MM-DD, local to the pool
  label: string; // "Sep 27"
  /** "Saturday" */
  weekday: string;
  /** Past, today, or a day ahead (forecast weather and the plan). */
  kind: "past" | "today" | "forecast";
  uv: number | null;
  rainMm: number | null;
  /** Chance of rain, percent (days ahead only). */
  rainChance: number | null;
  /** Daytime high, °C. */
  tmaxC: number | null;
  /** The rain is the owner's own figure for the pool, not the weather cell's. */
  ownRain: boolean;
  /** A day ahead, from the 7-day plan and the weather forecast. */
  forecast: boolean;
  /** The plan for this day: FC expected at its end, and what to add ("1 qt of liquid chlorine"). */
  plan: { fcEnd: number; fcAfterAdd: number; add: string | null } | null;
}

/** A point on the plan's predicted free chlorine line. */
export interface TrendForecastPoint {
  x: number;
  fc: number;
}

export interface TrendPoint {
  x: number;
  fc: number | null;
  ph: number | null;
  when: string; // "Sep 27, 8:30 AM"
}

export interface TrendMark {
  x: number;
  label: string; // "Added 2.5 qt of liquid chlorine 12.5%", "Cell set to 25%"
  when: string;
}

export interface TrendData {
  days: TrendDay[];
  points: TrendPoint[];
  doses: TrendMark[];
  fcBand: { low: number; high: number };
  /** Free chlorine should never fall below this, ppm. */
  fcMin: number | null;
  phBand: { low: number; high: number };
  units: Units;
  hasWeather: boolean;
  /** Index of today in `days`. */
  todayIndex: number;
  /** Predicted FC if the plan is followed: after each addition and at the end of each day. */
  forecast: TrendForecastPoint[];
  /** x where the forecast starts (now), or null without a plan. */
  forecastFrom: number | null;
  /** Estimated free chlorine from the last test to now (no test in between), with its ± spread. */
  estimate: TrendEstimatePoint[];
  /** At each test, what Tuffo expected from the test before it. */
  expected: TrendExpected[];
}

export interface TrendEstimatePoint extends TrendForecastPoint {
  /** Half the width of the estimate's ribbon here, ppm: it widens with days since the test. */
  spread: number;
}

export interface TrendExpected {
  x: number;
  expected: number;
  measured: number;
  when: string;
}

const DAY_MS = 86_400_000;
export const MIN_DAYS = 14;
export const MAX_DAYS = 30;

interface LocalParts {
  date: string;
  minutes: number;
}

function localParts(iso: string | number, timeZone: string): LocalParts {
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
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

function dateToUtcMs(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

function addDays(date: string, days: number): string {
  return new Date(dateToUtcMs(date) + days * DAY_MS).toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.round((dateToUtcMs(to) - dateToUtcMs(from)) / DAY_MS);
}

function dayLabel(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function weekdayLabel(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
}

function whenLabel(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
}

/**
 * The ranges the chart offers. "2 weeks" is the week behind, today and the week ahead;
 * the others reach back that many days (or to the season's first test) and also show the
 * days ahead.
 */
export const TREND_RANGES = [
  { value: "2w", label: "2 weeks" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "season", label: "Season" },
] as const;
export type TrendRange = (typeof TREND_RANGES)[number]["value"];
export const DEFAULT_RANGE: TrendRange = "2w";
/** Days ahead the chart shows: the plan's and the forecast's week. */
export const DAYS_AHEAD = 7;
/** The longest window the chart draws, days (a season is capped to this). */
export const LONGEST_DAYS = 366;

export function parseRange(value: unknown): TrendRange {
  return TREND_RANGES.find((r) => r.value === value)?.value ?? DEFAULT_RANGE;
}

/** Days of history a range needs loaded (a little more than it shows). */
export function rangeLookbackDays(range: TrendRange): number {
  return range === "season" ? 380 : range === "2w" ? 21 : Number(range) + 15;
}

/**
 * The first day of the pool year that `today` falls in: January 1, or July 1 south of the
 * equator, where the swimming season runs across the new year.
 */
export function seasonYearStart(today: string, southern = false): string {
  const year = Number(today.slice(0, 4));
  if (!southern) return `${year}-01-01`;
  return today >= `${year}-07-01` ? `${year}-07-01` : `${year - 1}-07-01`;
}

/**
 * The first local date a range covers. "This season" runs from the first test of this
 * pool year (pools opened in spring start there; year-round pools get the year), or the
 * pool year's first day without one (see seasonYearStart).
 */
export function rangeStart(
  range: TrendRange,
  now: number,
  timeZone: string,
  firstTestThisYear: string | null,
  southern = false,
): string {
  const end = localParts(now, timeZone).date;
  if (range === "2w") return addDays(end, -DAYS_AHEAD);
  if (range !== "season") return addDays(end, -(Number(range) - 1));
  const yearStart = seasonYearStart(end, southern);
  const first = firstTestThisYear ? localParts(firstTestThisYear, timeZone).date : null;
  const start = first && first >= yearStart && first <= end ? first : yearStart;
  // Very early in the year a season would be a few days: show at least two weeks.
  const twoWeeks = addDays(end, -(MIN_DAYS - 1));
  return start > twoWeeks ? twoWeeks : start;
}

/** The window: at least two weeks, at most a month, ending today and reaching back to the first test. */
export function trendWindow(
  firstTestIso: string | null,
  now: number,
  timeZone: string,
  fixedStart?: string,
): { start: string; end: string } {
  const end = localParts(now, timeZone).date;
  if (fixedStart) {
    const earliest = addDays(end, -(LONGEST_DAYS - 1));
    return { start: fixedStart < earliest ? earliest : fixedStart > end ? end : fixedStart, end };
  }
  const minStart = addDays(end, -(MAX_DAYS - 1));
  const defaultStart = addDays(end, -(MIN_DAYS - 1));
  if (!firstTestIso) return { start: defaultStart, end };
  const first = localParts(firstTestIso, timeZone).date;
  const start = first < minStart ? minStart : first < defaultStart ? first : defaultStart;
  return { start, end };
}

/** Fractional day index of an instant within a window that starts at `start` (local date). */
export function xFor(iso: string, start: string, timeZone: string): number {
  const local = localParts(iso, timeZone);
  return daysBetween(start, local.date) + local.minutes / 1440;
}

export interface BuildTrendInput {
  timeZone: string;
  /** A chosen range's first date (see rangeStart); without it, the automatic 2–4 weeks. */
  start?: string;
  now: number;
  units: Units;
  readings: Array<{ taken_at: string; fc: number | null; ph: number | null }>;
  doses: Array<{ added_at: string; label: string }>;
  weather: Array<{
    date: string;
    uv_index_max: number | null;
    precipitation_mm: number | null;
    tmax_c?: number | null;
    ownRain?: boolean;
  }>;
  /** The forecast from today on: the days ahead are drawn even without a plan. */
  forecastWeather?: Array<{
    date: string;
    uv_index_max: number | null;
    precipitation_mm: number | null;
    precipitation_probability?: number | null;
    tmax_c?: number | null;
  }>;
  fcBand: { low: number; high: number };
  fcMin?: number | null;
  /**
   * How fast the estimate's uncertainty grows, ppm per day since the test: from the
   * pool's own misses when it has a model, else 0.1.
   */
  estimateSpreadPerDay?: number;
  phBand: { low: number; high: number };
  /** Estimated FC from the last test to now; the first point is the test. */
  estimate?: Array<{ at: string; fc: number }> | null;
  /** What Tuffo expected at each test, from the one before. */
  expected?: Array<{ at: string; expected: number; measured: number }>;
  /** The 7-day plan from today, with the forecast weather for each day. */
  plan?: {
    /** A salt cell makes chlorine all day: the line runs smoothly between day ends. */
    continuous?: boolean;
    /** Free chlorine the plan starts from (now), for a salt plan without an estimate to start from. */
    fcStart?: number;
    days: Array<{
      date: string;
      fcAfterAdd: number;
      fcEnd: number;
      add: string | null;
      uv_index_max: number | null;
      precipitation_mm: number | null;
    }>;
  } | null;
}

export function buildTrend(input: BuildTrendInput): TrendData {
  const { timeZone } = input;
  const sortedReadings = [...input.readings].sort((a, b) => a.taken_at.localeCompare(b.taken_at));
  const { start, end } = trendWindow(sortedReadings[0]?.taken_at ?? null, input.now, timeZone, input.start);
  const count = daysBetween(start, end) + 1;

  const weatherByDate = new Map(input.weather.map((w) => [w.date, w]));
  const forecastByDate = new Map((input.forecastWeather ?? []).map((w) => [w.date, w]));
  const planDays = (input.plan?.days ?? []).filter((d) => d.date >= end).sort((a, b) => a.date.localeCompare(b.date));
  const planByDate = new Map(planDays.map((d) => [d.date, d]));
  const lastAhead = [...planDays.map((d) => d.date), ...forecastByDate.keys()]
    .filter((d) => d > end)
    .sort()
    .pop();
  const ahead = lastAhead ? Math.min(DAYS_AHEAD, daysBetween(end, lastAhead)) : 0;
  const days: TrendDay[] = Array.from({ length: count + ahead }, (_, i) => {
    const date = addDays(start, i);
    const w = weatherByDate.get(date);
    const f = forecastByDate.get(date);
    const p = planByDate.get(date);
    const forecast = date > end;
    return {
      date,
      label: dayLabel(date),
      weekday: weekdayLabel(date),
      kind: forecast ? "forecast" : date === end ? "today" : "past",
      uv: forecast ? (f?.uv_index_max ?? p?.uv_index_max ?? null) : (w?.uv_index_max ?? f?.uv_index_max ?? null),
      rainMm: forecast ? (f?.precipitation_mm ?? p?.precipitation_mm ?? null) : (w?.precipitation_mm ?? f?.precipitation_mm ?? null),
      rainChance: forecast || date === end ? (f?.precipitation_probability ?? null) : null,
      tmaxC: forecast ? (f?.tmax_c ?? null) : (w?.tmax_c ?? f?.tmax_c ?? null),
      ownRain: !forecast && Boolean(w?.ownRain),
      forecast,
      plan: p ? { fcEnd: p.fcEnd, fcAfterAdd: p.fcAfterAdd, add: p.add } : null,
    };
  });

  const nowX = xFor(new Date(input.now).toISOString(), start, timeZone);
  const inWindowX = (x: number) => x >= 0 && x <= count;

  // The estimate since the last test, up to now, widening with the days since the test.
  const perDay = input.estimateSpreadPerDay ?? 0.1;
  const rawEstimate = (input.estimate ?? []).map((p) => ({ x: Math.min(xFor(p.at, start, timeZone), nowX), fc: p.fc }));
  const testX = rawEstimate.length ? rawEstimate[0].x : 0;
  const estimate: TrendEstimatePoint[] = rawEstimate
    .map((p) => ({ ...p, spread: Math.round(perDay * Math.max(0, p.x - testX) * 100) / 100 }))
    .filter((p) => inWindowX(p.x));

  // The plan line: from now, after each day's addition and at the end of each day; for a
  // salt cell, straight from now through each day's end.
  const forecast: TrendForecastPoint[] = [];
  const continuous = Boolean(input.plan?.continuous);
  const lastEstimate = estimate.length ? estimate[estimate.length - 1] : null;
  if (continuous && planDays.length) {
    // fcAfterAdd is FC plus a whole day of the cell's output: not where the line starts.
    forecast.push({ x: nowX, fc: lastEstimate?.fc ?? input.plan?.fcStart ?? planDays[0].fcAfterAdd });
  }
  planDays.forEach((p) => {
    const k = daysBetween(start, p.date);
    if (!continuous) forecast.push({ x: Math.max(k, nowX), fc: p.fcAfterAdd });
    if (k + 1 > nowX) forecast.push({ x: k + 1, fc: p.fcEnd });
  });

  const inWindow = inWindowX;
  const points = sortedReadings
    .map((r) => ({ x: xFor(r.taken_at, start, timeZone), fc: r.fc, ph: r.ph, when: whenLabel(r.taken_at, timeZone) }))
    .filter((p) => inWindow(p.x) && (p.fc !== null || p.ph !== null));
  const doses = input.doses
    .map((d) => ({ x: xFor(d.added_at, start, timeZone), label: d.label, when: whenLabel(d.added_at, timeZone) }))
    .filter((d) => inWindow(d.x))
    .sort((a, b) => a.x - b.x);

  return {
    days,
    points,
    doses,
    fcBand: input.fcBand,
    fcMin: input.fcMin ?? null,
    phBand: input.phBand,
    units: input.units,
    hasWeather: days.some((d) => d.uv !== null || d.rainMm !== null),
    todayIndex: count - 1,
    forecast,
    forecastFrom: ahead > 0 ? nowX : null,
    estimate,
    expected: (input.expected ?? [])
      .map((e) => ({ x: xFor(e.at, start, timeZone), expected: e.expected, measured: e.measured, when: whenLabel(e.at, timeZone) }))
      .filter((e) => inWindowX(e.x)),
  };
}

/**
 * What a day says about free chlorine: the last test that day, else the estimate at the
 * end of the day (or now) between the last test and today, else the plan's end of day.
 */
export function fcForDay(data: TrendData, i: number): { value: number; kind: "measured" | "estimated" | "plan" } | null {
  const tests = data.points.filter((p) => p.fc !== null && Math.floor(p.x) === i);
  if (tests.length) return { value: tests[tests.length - 1].fc as number, kind: "measured" };
  const day = data.days[i];
  if (!day) return null;
  if (day.kind === "forecast") return day.plan ? { value: day.plan.fcEnd, kind: "plan" } : null;
  const est = [...data.estimate].reverse().find((p) => p.x <= i + 1 && p.x >= i);
  return est ? { value: est.fc, kind: "estimated" } : null;
}
