/**
 * "Between your last two tests", in plain words: one sentence on the weather and what
 * free chlorine did, and four stats with a qualifier each. Pure; browser-safe.
 */

import type { Units } from "@/lib/format";
import { uvLevel, UV_LEVEL_LABEL } from "@/lib/uv";
import { sunVerdict, type BetweenSummary } from "@/lib/weather/summary";

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
export function betweenStory(s: BetweenSummary, fc: { from: number | null; to: number | null }, swg: boolean): string {
  const sun = s.avgUvMax === null ? "" : ` of ${sunVerdict(s.avgUvMax)}`;
  const wet = s.daysWithWeather === 0 ? "" : s.wetDays > 0 ? ` and ${count(s.wetDays, "wet day")}` : ", all dry";
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
  } else if (fc.to > fc.from) {
    chlorine = swg
      ? `Free chlorine ${strong ? "still " : ""}went from ${from} to ${to}, so the cell made more than the sun burned.`
      : `Free chlorine went from ${from} to ${to}${added ? ` with the ${added} ppm you added` : ""}.`;
  } else {
    const perDay = loss !== null && loss >= 0.05 ? loss.toFixed(1) : null;
    chlorine = swg
      ? `Free chlorine went from ${from} to ${to}${perDay ? `, so the sun burned about ${perDay} ppm a day more than the cell made` : ""}.`
      : `Free chlorine went from ${from} to ${to}${perDay ? `: about ${perDay} ppm a day` : ""}${added ? `, counting the ${added} ppm you added` : ""}.`;
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
  if (s.sunshineHours !== null && s.daysWithWeather > 0) {
    stats.push({ label: "Sunshine", value: `${Math.round(s.sunshineHours / s.daysWithWeather)} h`, qualifier: "a day" });
  }
  if (s.avgTmaxC !== null) {
    const t = units === "us" ? `${Math.round((s.avgTmaxC * 9) / 5 + 32)} °F` : `${Math.round(s.avgTmaxC)} °C`;
    stats.push({ label: "Daytime high", value: t, qualifier: "average" });
  }
  if (s.rainMm !== null) {
    stats.push({
      label: "Rain",
      value: rainText(s.rainMm, units),
      qualifier: s.wetDays > 0 ? `over ${s.wetDays} ${s.wetDays === 1 ? "day" : "days"}` : "no wet days",
    });
  }
  return stats;
}
