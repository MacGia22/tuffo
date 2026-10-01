import type { Units } from "@/lib/format";

/**
 * Shapes a pool's tests, doses and daily weather into the data the trend chart
 * draws. Everything is placed on the pool's own calendar (its timezone), with x
 * measured in days from the start of the window: day i spans [i, i + 1).
 */

export interface TrendDay {
  date: string; // YYYY-MM-DD, local to the pool
  label: string; // "Sep 27"
  uv: number | null;
  rainMm: number | null;
  /** The rain is the owner's own figure for the pool, not the weather cell's. */
  ownRain: boolean;
  /** A day ahead, from the 7-day plan and the weather forecast. */
  forecast: boolean;
  /** The plan for this day: FC expected at its end, and what to add ("1 qt of liquid chlorine"). */
  plan: { fcEnd: number; add: string | null } | null;
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
  label: string; // "2.5 qt liquid chlorine 12.5%"
  when: string;
}

export interface TrendData {
  days: TrendDay[];
  points: TrendPoint[];
  doses: TrendMark[];
  fcBand: { low: number; high: number };
  phBand: { low: number; high: number };
  units: Units;
  hasWeather: boolean;
  /** Predicted FC if the plan is followed: after each addition and at the end of each day. */
  forecast: TrendForecastPoint[];
  /** x where the forecast starts (now), or null without a plan. */
  forecastFrom: number | null;
  /** Estimated free chlorine from the last test to now (no test in between), dotted. */
  estimate: TrendForecastPoint[];
  /** At each test, what Tuffo expected from the test before it. */
  expected: TrendExpected[];
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

function whenLabel(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
}

/** The window: at least two weeks, at most a month, ending today and reaching back to the first test. */
export function trendWindow(firstTestIso: string | null, now: number, timeZone: string): { start: string; end: string } {
  const end = localParts(now, timeZone).date;
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
  now: number;
  units: Units;
  readings: Array<{ taken_at: string; fc: number | null; ph: number | null }>;
  doses: Array<{ added_at: string; label: string }>;
  weather: Array<{ date: string; uv_index_max: number | null; precipitation_mm: number | null; ownRain?: boolean }>;
  fcBand: { low: number; high: number };
  phBand: { low: number; high: number };
  /** Estimated FC from the last test to now. */
  estimate?: Array<{ at: string; fc: number }> | null;
  /** What Tuffo expected at each test, from the one before. */
  expected?: Array<{ at: string; expected: number; measured: number }>;
  /** The 7-day plan from today, with the forecast weather for each day. */
  plan?: {
    /** A salt cell makes chlorine all day: the line runs smoothly between day ends. */
    continuous?: boolean;
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
  const { start, end } = trendWindow(sortedReadings[0]?.taken_at ?? null, input.now, timeZone);
  const count = daysBetween(start, end) + 1;

  const weatherByDate = new Map(input.weather.map((w) => [w.date, w]));
  const planDays = (input.plan?.days ?? []).filter((d) => d.date >= end).sort((a, b) => a.date.localeCompare(b.date));
  const planByDate = new Map(planDays.map((d) => [d.date, d]));
  const ahead = planDays.filter((d) => d.date > end).length;
  const days: TrendDay[] = Array.from({ length: count + ahead }, (_, i) => {
    const date = addDays(start, i);
    const w = weatherByDate.get(date);
    const p = planByDate.get(date);
    const forecast = date > end;
    return {
      date,
      label: dayLabel(date),
      uv: forecast ? (p?.uv_index_max ?? null) : (w?.uv_index_max ?? null),
      rainMm: forecast ? (p?.precipitation_mm ?? null) : (w?.precipitation_mm ?? null),
      ownRain: !forecast && Boolean(w?.ownRain),
      forecast,
      plan: p ? { fcEnd: p.fcEnd, add: p.add } : null,
    };
  });

  const nowX = xFor(new Date(input.now).toISOString(), start, timeZone);
  const inWindowX = (x: number) => x >= 0 && x <= count;

  // The estimate since the last test, up to now.
  const estimate: TrendForecastPoint[] = (input.estimate ?? [])
    .map((p) => ({ x: Math.min(xFor(p.at, start, timeZone), nowX), fc: p.fc }))
    .filter((p) => inWindowX(p.x));

  // The plan line: from now, after each day's addition and at the end of each day; for a
  // salt cell, straight from now through each day's end.
  const forecast: TrendForecastPoint[] = [];
  const continuous = Boolean(input.plan?.continuous);
  const lastEstimate = estimate.length ? estimate[estimate.length - 1] : null;
  if (continuous && planDays.length) {
    forecast.push({ x: nowX, fc: lastEstimate?.fc ?? planDays[0].fcAfterAdd });
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
    phBand: input.phBand,
    units: input.units,
    hasWeather: days.some((d) => d.uv !== null || d.rainMm !== null),
    forecast,
    forecastFrom: forecast.length ? nowX : null,
    estimate,
    expected: (input.expected ?? [])
      .map((e) => ({ x: xFor(e.at, start, timeZone), expected: e.expected, measured: e.measured, when: whenLabel(e.at, timeZone) }))
      .filter((e) => inWindowX(e.x)),
  };
}
