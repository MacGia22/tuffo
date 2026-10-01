import type { Plan, PlanDay } from "@/engine/server";

/**
 * The plan as stored in `plans` and read by the pool page and alert emails: the
 * engine's advice plus where it started from. No model coefficients.
 */

export interface StoredPlanDay extends PlanDay {
  /** Liquid chlorine 12.5% for `addPpm`, mL (0 when nothing to add). */
  addMl: number;
}

export interface StoredPlanSummary {
  kind: Plan["kind"];
  fc: Plan["fc"];
  floor: number;
  swgPercent: number | null;
  /** Salt pools starting above the target: a lower setting (0 = off) before `until`. Absent on older plans. */
  swgStart?: { percent: number; until: string } | null;
  swgNeedPpm: number | null;
  capped: boolean;
  lowWithoutChlorine: string | null;
  confidence: Plan["confidence"];
  pairs: number;
  /** FC the plan starts from, estimated from the last test. */
  fcStart: number;
  lastTestAt: string;
  /** Days between the last free chlorine test and when the plan was made. */
  daysSinceTest: number;
  product: string;
  /** Salt pools: hours a day the cell runs (latest pump schedule), and the last logged setting. */
  cellHours?: number | null;
  cellSetting?: number | null;
  /** Salt pools: what is missing for a setting in percent. */
  cellNeeds?: "rating" | "pump" | null;
}

export interface StoredPlan {
  computedAt: string;
  version: number;
  summary: StoredPlanSummary;
  days: StoredPlanDay[];
}

/** A plan older than this, or older than the latest test, is recomputed on the next page view. */
export const PLAN_STALE_HOURS = 26;
/** Beyond this many days since a free chlorine test, the plan asks for a new one. */
export const PLAN_TEST_AGE_DAYS = 4;

export function parseStoredPlan(row: { computed_at: string; version: number; summary: unknown; days: unknown } | null): StoredPlan | null {
  if (!row || !row.summary || !Array.isArray(row.days) || typeof row.summary !== "object") return null;
  const summary = row.summary as StoredPlanSummary;
  if (typeof summary.fcStart !== "number" || !summary.fc) return null;
  return { computedAt: row.computed_at, version: row.version, summary, days: row.days as StoredPlanDay[] };
}

export function planIsStale(plan: StoredPlan | null, latestTestAt: string | null, now = Date.now()): boolean {
  if (!plan) return true;
  const computed = Date.parse(plan.computedAt);
  if (now - computed > PLAN_STALE_HOURS * 3_600_000) return true;
  return latestTestAt !== null && Date.parse(latestTestAt) > computed;
}

/**
 * Free chlorine now, from the last test: what it read, plus chlorine logged since, minus
 * the predicted daily use for the time gone by (at most a week). A salt pool's cell has
 * been making chlorine all along at an unknown setting, so its level is carried as is.
 */
export function estimateStartFc(input: {
  fc: number;
  addedPpm: number;
  daysSince: number;
  dailyLossPpm: number;
  swg: boolean;
}): number {
  const added = input.fc + Math.max(0, input.addedPpm);
  if (input.swg) return Math.round(added * 100) / 100;
  const elapsed = Math.min(7, Math.max(0, input.daysSince));
  return Math.round(Math.max(0, added - input.dailyLossPpm * elapsed) * 100) / 100;
}

/**
 * Whether the plan's free chlorine line means anything: always for liquid chlorine; for a
 * salt pool only once the cell's output is known (rating and pump schedule), otherwise
 * the simulation leaves the cell out and FC would seem to drain to zero.
 */
/** The cell setting the plan gives for a day: the starting one before `until`, then the weekly one. */
export function cellPercentOn(summary: Pick<StoredPlanSummary, "swgPercent" | "swgStart">, date: string): number | null {
  if (summary.swgPercent === null) return null;
  return summary.swgStart && date < summary.swgStart.until ? summary.swgStart.percent : summary.swgPercent;
}

export function planHasFcLine(summary: Pick<StoredPlanSummary, "kind" | "swgPercent">): boolean {
  return summary.kind === "manual" || summary.swgPercent !== null;
}

/** "Based on typical pools…" or "From your pool's own…", for the page and emails. */
export function confidenceText(summary: Pick<StoredPlanSummary, "confidence" | "pairs">, ownPairs: number): string {
  if (summary.confidence === "typical") {
    const have = summary.pairs === 1 ? "1 test pair" : `${summary.pairs} test pairs`;
    return `Based on typical pools until you have ${ownPairs} test pairs (you have ${have}), so it keeps a wider margin.`;
  }
  return `From your pool's own chlorine use (${summary.pairs} test pairs) and the forecast.`;
}
