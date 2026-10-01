/**
 * What a pool's card on the pools list says at a glance: how old the last test is, free
 * chlorine against its target, today's plan action, maintenance due and whether alerts
 * are on. Pure; the page loads the rows.
 */

import { baseToShelf, formatShelf } from "@/lib/dose-format";
import type { Units } from "@/lib/format";
import type { StoredPlan } from "@/lib/plan/stored";
import { levelOf, testAge, type Level } from "@/lib/tiles";

export interface CardInput {
  units: Units;
  today: string;
  now: number;
  /** The latest test with free chlorine, and its FC target band. */
  latestFc: { takenAt: string; fc: number; target: { low: number; high: number } } | null;
  /** The latest test of any kind. */
  lastTestAt: string | null;
  plan: StoredPlan | null;
  maintenance: { overdue: number; due: number } | null;
  alertsOn: boolean;
}

export interface CardFacts {
  age: { text: string; stale: boolean } | null;
  fc: { value: number; level: Level; target: string } | null;
  action: string | null;
  maintenance: { text: string; overdue: boolean } | null;
  alertsOn: boolean;
}

export function cardFacts(input: CardInput): CardFacts {
  const age = input.lastTestAt ? testAge(input.lastTestAt, input.now) : null;
  const fc = input.latestFc
    ? {
        value: input.latestFc.fc,
        level: levelOf(input.latestFc.fc, input.latestFc.target),
        target: `${input.latestFc.target.low}–${input.latestFc.target.high}`,
      }
    : null;

  let action: string | null = null;
  const day = input.plan?.days.find((d) => d.date === input.today);
  if (input.plan && day) {
    if (input.plan.summary.kind === "swg") {
      action = input.plan.summary.swgPercent !== null ? `Cell ${input.plan.summary.swgPercent}%` : null;
    } else if (day.addMl > 0) {
      const shelf = baseToShelf(day.addMl, "mL", input.units);
      action = shelf.value > 0 ? `Add ${formatShelf(shelf.value, shelf.unit)}` : "Nothing to add";
    } else {
      action = "Nothing to add";
    }
  }

  const m = input.maintenance;
  const maintenance =
    m && m.overdue + m.due > 0
      ? {
          text: m.overdue > 0 ? `${m.overdue} overdue${m.due > 0 ? `, ${m.due} due` : ""}` : `${m.due} due`,
          overdue: m.overdue > 0,
        }
      : null;

  return { age: age ? { text: age.text, stale: age.stale } : null, fc, action, maintenance, alertsOn: input.alertsOn };
}
