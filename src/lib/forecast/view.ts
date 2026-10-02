import type { Plan } from "@/engine/server";
import { formatVolume, rainLabel, type Units } from "@/lib/format";
import type { ForecastInput } from "./params";

/**
 * What the public forecast page shows, built on the server from the engine's plan:
 * rounded display values only. No coefficients, priors or unrounded model output go
 * to the browser. Pure.
 */

const ML_PER_QT = 946.352946;
const MM_PER_IN = 25.4;
/** Liquid chlorine 12.5%: 125 mg of available chlorine per mL. */
const LIQUID_MG_PER_ML = 125;

/**
 * The week's average use against the same pool on a clear 90 °F summer day: below half
 * of it is "low", from 85% up "high".
 */
export const USE_LOW_SHARE = 0.5;
export const USE_HIGH_SHARE = 0.85;
/** Peak UV index at or above this counts as strong sun. */
export const STRONG_UV = 8;

export interface ForecastWeatherDay {
  date: string;
  uvIndexMax: number | null;
  tmaxC: number | null;
  rainMm: number | null;
  /** Chance of rain, percent; null when the forecast has none. */
  rainChance?: number | null;
}

export interface ForecastDayView {
  date: string;
  /** "Mon", and "Monday" for sentences. */
  day: string;
  dayLong: string;
  /** "Oct 2" */
  label: string;
  uv: number | null;
  /** "88 °F" */
  high: string | null;
  /** "1.4 in" / "36 mm"; null for no measurable rain. */
  rainfall: string | null;
  /** For the card: "0.3 in · 60%", "40% chance" or "Dry". */
  rainNote: string;
  /** The first day of the week (today at the pool). */
  today: boolean;
  /** Chlorine used that day, ppm, to 0.5. */
  usePpm: number;
  /** Manual pools: liquid chlorine 12.5% to add, "1.25 qt" / "1.5 L"; null for nothing. */
  add: string | null;
  /** Chlorine used that day, ppm, to 0.1 (the card's "Sun and heat use ≈ 1.8 ppm"). */
  useText: string;
  algaeRisk: boolean;
  /** Share of the water the day's rain replaces, whole percent; null when below the flag. */
  dilutionPercent: number | null;
  /** Stabilizer after that rain, ppm. */
  cyaAfter: number | null;
}

export interface ForecastView {
  place: string;
  units: Units;
  sanitizer: ForecastInput["sanitizer"];
  /** First day of the week, YYYY-MM-DD, and "Oct 2". */
  weekOf: string;
  weekOfLabel: string;
  level: "high" | "normal" | "low";
  /** Lowest and highest daily use, ppm, to 0.5. */
  useLow: number;
  useHigh: number;
  why: string | null;
  days: ForecastDayView[];
  target: { min: number; low: number; high: number };
  /** Manual pools: the first day without chlorine where FC would fall below the minimum. */
  lowWithoutChlorine: string | null;
  capped: boolean;
  /** Salt pools. */
  salt: { needPpm: number; percent: number | null; cell: string } | null;
  volume: string;
  cya: number;
  /** Manual pools: the week's liquid chlorine, "2.5 qt"; null when nothing is added. */
  weekAdd: string | null;
  /** The level the plan starts from, ppm. */
  startPpm: number;
}

export function roundTo(value: number, step: number): number {
  return Number((Math.round(value / step) * step).toFixed(2));
}

/** Liquid chlorine 12.5% for a rise in a pool, in quarts or liters to 0.25 (never shown as 0). */
export function liquidChlorine(ppm: number, volumeL: number, units: Units): string | null {
  if (!(ppm > 0)) return null;
  const ml = (ppm * volumeL) / LIQUID_MG_PER_ML;
  const value = Math.max(0.25, roundTo(units === "us" ? ml / ML_PER_QT : ml / 1000, 0.25));
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${units === "us" ? "qt" : "L"}`;
}

/** Rain to 0.1 in or 1 mm; null when it rounds to nothing. */
export function rainText(mm: number | null, units: Units): string | null {
  if (mm === null || !(mm > 0)) return null;
  if (units === "us") {
    const inches = roundTo(mm / MM_PER_IN, 0.1);
    return inches > 0 ? `${inches.toFixed(1)} in` : null;
  }
  const r = Math.round(mm);
  return r > 0 ? `${r} mm` : null;
}

export function temperatureText(c: number | null, units: Units): string | null {
  if (c === null) return null;
  return units === "us" ? `${Math.round((c * 9) / 5 + 32)} °F` : `${Math.round(c)} °C`;
}

export function chlorineUseLevel(averagePpm: number, summerDayPpm: number): ForecastView["level"] {
  if (!(summerDayPpm > 0)) return "normal";
  const share = averagePpm / summerDayPpm;
  if (share >= USE_HIGH_SHARE) return "high";
  if (share < USE_LOW_SHARE) return "low";
  return "normal";
}

function dayNames(date: string) {
  const d = new Date(`${date}T12:00:00Z`);
  const f = (o: Intl.DateTimeFormatOptions) => d.toLocaleDateString("en-US", { ...o, timeZone: "UTC" });
  return { day: f({ weekday: "short" }), dayLong: f({ weekday: "long" }), label: f({ month: "short", day: "numeric" }) };
}

/**
 * One line on why: the run of strong-sun days, and the rain that dilutes stabilizer most.
 * `sunShare` is the share of the week's use that comes from sun (0–1).
 */
export function whyLine(days: ForecastDayView[], sunShare: number): string | null {
  const parts: string[] = [];
  const strong = days.map((d) => d.uv !== null && d.uv >= STRONG_UV && !d.dilutionPercent);
  // Longest run of consecutive strong-sun days.
  let best = { start: -1, length: 0 };
  for (let i = 0; i < strong.length; i += 1) {
    if (!strong[i]) continue;
    let j = i;
    while (j + 1 < strong.length && strong[j + 1]) j += 1;
    if (j - i + 1 > best.length) best = { start: i, length: j - i + 1 };
    i = j;
  }
  const verb = sunShare >= 0.5 ? "burns most of it" : "uses the most";
  const count = strong.filter(Boolean).length;
  if (best.length >= 2 && count === best.length) {
    parts.push(`Strong sun ${days[best.start].dayLong} to ${days[best.start + best.length - 1].dayLong} ${verb}`);
  } else if (count >= 2) {
    parts.push(`Strong sun on ${count} of ${days.length} days ${verb}`);
  } else if (count === 1) {
    parts.push(`Strong sun on ${days[strong.indexOf(true)].dayLong} ${verb}`);
  } else if (sunShare < 0.35) {
    parts.push("Mild sun keeps chlorine use down");
  }

  const wettest = days
    .filter((d) => d.dilutionPercent !== null)
    .sort((a, b) => (b.dilutionPercent ?? 0) - (a.dilutionPercent ?? 0))[0];
  if (wettest) {
    const rain = wettest.rainfall ? `${wettest.rainfall} of rain` : "rain";
    parts.push(`${wettest.dayLong}'s ${rain} dilutes stabilizer about ${wettest.dilutionPercent}%`);
  }
  if (parts.length === 0) return null;
  return `${parts.join("; ")}.`;
}

export interface BuildViewInput {
  input: ForecastInput;
  plan: Plan;
  weather: ForecastWeatherDay[];
  /** Share of the week's predicted use that comes from sun, 0–1. */
  sunShare: number;
  /** The same pool's use on a clear 90 °F summer day, ppm (not shown). */
  summerDayPpm: number;
  /** Salt pools: what the typical cell is, in words. */
  cellText: string;
}

export function buildForecastView({ input, plan, weather, sunShare, summerDayPpm, cellText }: BuildViewInput): ForecastView {
  const units = input.units;
  const byDate = new Map(weather.map((w) => [w.date, w]));
  const swg = plan.kind === "swg";
  const days: ForecastDayView[] = plan.days.map((d, i) => {
    const w = byDate.get(d.date);
    const names = dayNames(d.date);
    return {
      date: d.date,
      ...names,
      uv: w?.uvIndexMax === null || w?.uvIndexMax === undefined ? null : Math.round(w.uvIndexMax),
      high: temperatureText(w?.tmaxC ?? null, units),
      rainfall: rainText(d.rainMm, units),
      rainNote: rainLabel(d.rainMm ?? 0, w?.rainChance ?? null, units) ?? "Dry",
      today: i === 0,
      usePpm: roundTo(d.lossPpm, 0.5),
      useText: `${roundTo(d.lossPpm, 0.1).toFixed(1)} ppm`,
      add: swg ? null : liquidChlorine(d.addPpm, input.volumeL, units),
      algaeRisk: d.algaeRisk,
      dilutionPercent: d.dilution ? Math.max(1, Math.round(d.dilution.percent)) : null,
      cyaAfter: d.dilution?.cya ?? null,
    };
  });
  const losses = plan.days.map((d) => d.lossPpm);
  const average = losses.reduce((a, b) => a + b, 0) / Math.max(1, losses.length);
  const first = days[0];
  return {
    place: input.place,
    units,
    sanitizer: input.sanitizer,
    weekOf: first?.date ?? "",
    weekOfLabel: first?.label ?? "",
    level: chlorineUseLevel(average, summerDayPpm),
    useLow: roundTo(Math.min(...losses), 0.5),
    useHigh: roundTo(Math.max(...losses), 0.5),
    why: whyLine(days, sunShare),
    days,
    target: { min: plan.fc.min, low: plan.fc.targetLow, high: plan.fc.targetHigh },
    lowWithoutChlorine: swg ? null : plan.lowWithoutChlorine,
    capped: plan.capped,
    salt: swg ? { needPpm: roundTo(plan.swgNeedPpm ?? average, 0.5), percent: plan.swgPercent, cell: cellText } : null,
    // As everywhere in the app: exact below 1,000, to the 100 above.
    volume: formatVolume(input.volumeL, units),
    cya: input.cya,
    weekAdd: swg ? null : liquidChlorine(plan.days.reduce((sum, d) => sum + d.addPpm, 0), input.volumeL, units),
    startPpm: plan.days.length ? roundTo(plan.days[0].fcAfterAdd - plan.days[0].addPpm, 0.5) : plan.fc.targetLow,
  };
}
