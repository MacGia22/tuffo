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
  weather: Array<{ date: string; uv_index_max: number | null; precipitation_mm: number | null }>;
  fcBand: { low: number; high: number };
  phBand: { low: number; high: number };
}

export function buildTrend(input: BuildTrendInput): TrendData {
  const { timeZone } = input;
  const sortedReadings = [...input.readings].sort((a, b) => a.taken_at.localeCompare(b.taken_at));
  const { start, end } = trendWindow(sortedReadings[0]?.taken_at ?? null, input.now, timeZone);
  const count = daysBetween(start, end) + 1;

  const weatherByDate = new Map(input.weather.map((w) => [w.date, w]));
  const days: TrendDay[] = Array.from({ length: count }, (_, i) => {
    const date = addDays(start, i);
    const w = weatherByDate.get(date);
    return {
      date,
      label: dayLabel(date),
      uv: w?.uv_index_max ?? null,
      rainMm: w?.precipitation_mm ?? null,
    };
  });

  const inWindow = (x: number) => x >= 0 && x <= count;
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
  };
}
