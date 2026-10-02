/**
 * "Between your last two tests", in plain words: one sentence on the weather and what
 * free chlorine did, and four stats with a qualifier each. Pure; browser-safe.
 */

import type { Units } from "@/lib/format";
import { uvLevel, UV_LEVEL_LABEL } from "@/lib/uv";
import { localDateRange, summarizeBetween, sunVerdict, type BetweenSummary, type WeatherDay } from "@/lib/weather/summary";

const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

function count(n: number, noun: string): string {
  return `${n <= 10 ? WORDS[n] : n} ${noun}${n === 1 ? "" : "s"}`;
}

function rainText(mm: number, units: Units): string {
  return units === "us" ? `${(mm / 25.4).toFixed(2)} in` : `${mm.toFixed(0)} mm`;
}

/**
 * "8 days of strong sun and two wet days. Free chlorine still went from 3.0 to 8.0, so
 * the cell made more than the sun burned."
 */
/** Wet days, never more than the days between the tests (both end dates' weather is counted in full). */
function wetDaysOf(s: BetweenSummary): number {
  return Math.min(s.wetDays, s.days);
}

export function betweenStory(s: BetweenSummary, fc: { from: number | null; to: number | null }, swg: boolean): string {
  const sun = s.avgUvMax === null ? "" : ` of ${sunVerdict(s.avgUvMax)}`;
  const wetDays = wetDaysOf(s);
  const wet = s.daysWithWeather === 0 ? "" : wetDays > 0 ? ` and ${count(wetDays, "wet day")}` : ", all dry";
  const weather = `${count(s.days, "day")}${sun}${wet}.`.replace(/^./, (c) => c.toUpperCase());
  if (fc.from === null || fc.to === null) return weather;
  const from = fc.from.toFixed(1);
  const to = fc.to.toFixed(1);
  const strong = s.avgUvMax !== null && s.avgUvMax >= 7;
  const added = s.fcAddedPpm > 0 ? s.fcAddedPpm.toFixed(1) : null;
  const loss = s.fcLossPerDay;
  let chlorine: string;
  if (Math.abs(fc.to - fc.from) < 0.25 && !added) {
    chlorine = swg ? `Free chlorine held at about ${to}, so the cell kept up.` : `Free chlorine held at about ${to}.`;
  } else if (swg) {
    // What the cell made minus what the sun and heat burned: the change, less what was poured in.
    const net = fc.to - fc.from - s.fcAddedPpm;
    const went = `Free chlorine ${strong && fc.to > fc.from && !added ? "still " : ""}went from ${from} to ${to}${added ? ` with the ${added} ppm you added` : ""}`;
    const perDay = loss !== null && loss >= 0.05 ? loss.toFixed(1) : null;
    chlorine =
      Math.abs(net) / s.days < 0.05
        ? `${went}, so the cell kept up.`
        : net > 0
          ? `${went}, so the cell made more than the sun burned.`
          : `${went}${perDay ? `, so the sun burned about ${perDay} ppm a day more than the cell made` : ""}.`;
  } else if (fc.to > fc.from) {
    chlorine = `Free chlorine went from ${from} to ${to}${added ? ` with the ${added} ppm you added` : ""}.`;
  } else {
    const perDay = loss !== null && loss >= 0.05 ? loss.toFixed(1) : null;
    chlorine = `Free chlorine went from ${from} to ${to}${perDay ? `: about ${perDay} ppm a day` : ""}${added ? `, counting the ${added} ppm you added` : ""}.`;
  }
  return `${weather} ${chlorine}`;
}

export interface BetweenStat {
  label: string;
  value: string;
  qualifier: string;
}

/** Peak UV "7.7 average · Very high", Sunshine "10 h a day", Daytime high "88 °F average", Rain "0.46 in over 2 days". */
export function betweenStats(s: BetweenSummary, units: Units): BetweenStat[] {
  const stats: BetweenStat[] = [];
  if (s.avgUvMax !== null) {
    stats.push({ label: "Peak UV", value: s.avgUvMax.toFixed(1), qualifier: `average · ${UV_LEVEL_LABEL[uvLevel(s.avgUvMax)]}` });
  }
  if (s.sunshineHours !== null && s.sunshineDays > 0) {
    stats.push({ label: "Sunshine", value: `${Math.round(s.sunshineHours / s.sunshineDays)} h`, qualifier: "a day" });
  }
  if (s.avgTmaxC !== null) {
    const t = units === "us" ? `${Math.round((s.avgTmaxC * 9) / 5 + 32)} °F` : `${Math.round(s.avgTmaxC)} °C`;
    stats.push({ label: "Daytime high", value: t, qualifier: "average" });
  }
  if (s.rainMm !== null) {
    stats.push({
      label: "Rain",
      value: rainText(s.rainMm, units),
      qualifier: wetDaysOf(s) > 0 ? `over ${wetDaysOf(s)} ${wetDaysOf(s) === 1 ? "day" : "days"}` : "no wet days",
    });
  }
  return stats;
}

export interface BetweenReading {
  taken_at: string;
  fc: number | null;
}

/** The pool's last two tests with free chlorine; without two of those, its last two tests. */
export function lastTwoTests<T extends BetweenReading>(readings: T[]): { previous: T; latest: T } | null {
  const sorted = [...readings].sort((a, b) => Date.parse(b.taken_at) - Date.parse(a.taken_at));
  const withFc = sorted.filter((r) => r.fc !== null && r.fc !== undefined);
  const pair = withFc.length >= 2 ? withFc : sorted;
  return pair.length >= 2 ? { previous: pair[1], latest: pair[0] } : null;
}

export interface BetweenResult<T extends BetweenReading> {
  previous: T;
  latest: T;
  summary: BetweenSummary;
  story: string;
  stats: BetweenStat[];
}

/**
 * "Between your last two tests" from the pool's own data: its last two tests (see
 * lastTwoTests), the weather on the pool's calendar days from one to the other, and
 * what was added in between (`fcAddedPpm`, `notes` get the two instants in ms).
 */
export function betweenLastTests<T extends BetweenReading>(input: {
  readings: T[];
  weather: WeatherDay[];
  timeZone: string;
  units: Units;
  swg: boolean;
  fcAddedPpm?: (from: number, to: number) => number;
  notes?: (from: number, to: number) => string[];
}): BetweenResult<T> | null {
  const pair = lastTwoTests(input.readings);
  if (!pair) return null;
  const { previous, latest } = pair;
  const range = localDateRange(previous.taken_at, latest.taken_at, input.timeZone);
  const days = input.weather.filter((w) => w.date >= range.from && w.date <= range.to);
  const t0 = Date.parse(previous.taken_at);
  const t1 = Date.parse(latest.taken_at);
  const fc = (r: T) => (r.fc === null || r.fc === undefined ? null : Number(r.fc));
  const summary = summarizeBetween({ taken_at: previous.taken_at, fc: fc(previous) }, { taken_at: latest.taken_at, fc: fc(latest) }, days, {
    fcAddedPpm: input.fcAddedPpm?.(t0, t1) ?? 0,
    notes: input.notes?.(t0, t1) ?? [],
  });
  return {
    previous,
    latest,
    summary,
    story: betweenStory(summary, { from: fc(previous), to: fc(latest) }, input.swg),
    stats: betweenStats(summary, input.units),
  };
}
