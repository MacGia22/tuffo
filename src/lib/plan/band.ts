import type { StoredPlan } from "./stored";

/**
 * What to change when the forecast free chlorine leaves the target band, in one plain
 * sentence: skip chlorine while it is above, lower the salt cell, or watch a low day.
 * Pure; the plan strip shows it under the Today line. Advice only.
 */

function weekday(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
}

export interface BandAdvice {
  direction: "high" | "low";
  text: string;
}

/**
 * `days` are the plan's days from today on. `levels` are the settings the cell offers
 * (percent, ascending), or null for any 5% step.
 */
export function bandAdvice(plan: Pick<StoredPlan, "summary" | "days">, today: string, levels: number[] | null): BandAdvice | null {
  const { summary } = plan;
  const days = plan.days.filter((d) => d.date >= today);
  if (days.length === 0) return null;
  const { targetHigh, min } = summary.fc;
  const label = (date: string) => (date === today ? "today" : weekday(date));

  const low = days.find((d) => d.algaeRisk);
  if (low) {
    return {
      direction: "low",
      text:
        summary.kind === "swg"
          ? `Free chlorine may fall below ${min} ppm by ${label(low.date)} even at ${summary.swgPercent ?? 100}%: test that morning and top up with liquid chlorine if it is low.`
          : `Free chlorine may fall below ${min} ppm by ${label(low.date)} even with the plan: test that morning and add more if it is low.`,
    };
  }

  if (summary.kind === "manual") {
    // Above the band now: nothing to add until the first day the plan adds again.
    if (summary.fcStart <= targetHigh) return null;
    const next = days.find((d) => d.addMl > 0);
    if (next && next.date === today) return null;
    const band = `${summary.fc.targetLow}–${targetHigh} ppm`;
    return {
      direction: "high",
      text: next
        ? `Free chlorine is above the ${band} target: skip chlorine until ${weekday(next.date)}.`
        : `Free chlorine is above the ${band} target: skip chlorine this week.`,
    };
  }

  // Salt pool: the first day the cell pushes it above the band.
  const percent = summary.swgPercent;
  if (percent === null) return null;
  const high = days.find((d) => d.fcEnd > targetHigh);
  if (!high) return null;
  const steps = levels && levels.length ? [0, ...levels] : Array.from({ length: 21 }, (_, i) => i * 5);
  // The next setting down (on a 5% dial, 10 points down, to be worth a change).
  const lower = [...steps].reverse().find((l) => (levels ? l < percent : l <= percent - 10));
  const when = label(high.date);
  if (lower === undefined || lower === 0) {
    return {
      direction: "high",
      text: `Even at ${percent}% free chlorine climbs above ${targetHigh} ppm by ${when}: switch the cell off for a day when a test shows it above ${targetHigh}.`,
    };
  }
  return {
    direction: "high",
    text: `At ${percent}% free chlorine climbs above ${targetHigh} ppm by ${when}: lower the cell to ${lower}% from ${when}, then test.`,
  };
}
