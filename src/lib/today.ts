/**
 * The pool page's "Today" view, as data: the test status card, the actions ("What to do
 * now", most urgent first) and the 7-day cards. Pure; the page loads the rows and the
 * engine's advice, this file decides what to say and in what order. Advisory only.
 */

import { rainLabel, type Units } from "@/lib/format";
import { ageText } from "@/lib/tiles";
import { uvLevel, type UvLevel } from "@/lib/uv";
import { cellSettingText } from "@/lib/salt-cells";

const DAY_MS = 86_400_000;

function shortDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** After this many days the test card turns to "Time to test". */
export const TEST_DUE_DAYS = 7;

export interface TestStatus {
  /** "Tested 5 days ago" or "Time to test" */
  title: string;
  /** "Sat, Sep 26 · 12:00 PM · drop kit" */
  detail: string;
  due: boolean;
}

export function testStatus(takenAt: string, method: string, now: number, timeZone: string): TestStatus {
  const ms = Math.max(0, now - Date.parse(takenAt));
  const age = ageText(takenAt, now, timeZone).text;
  const when = new Date(takenAt);
  const date = when.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone });
  const time = when.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone });
  const due = ms / DAY_MS > TEST_DUE_DAYS;
  return {
    title: due ? "Time to test" : `Tested ${age}`,
    detail: `${due ? `Last test ${age} · ` : ""}${date} · ${time} · ${method.toLowerCase()}`,
    due,
  };
}

export interface TodayAction {
  id: string;
  /** An instruction: "Add 1 qt of liquid chlorine 12.5%", "Set the salt cell to 25%". */
  title: string;
  /** One or two sentences of why, with numbers. */
  why: string;
  /** "Today", "This week", "Overdue", "Around Oct 6". */
  pill: string;
  /** The button that logs it: "I set it to 25%". */
  button?: { label: string; href: string };
  /** Handling notes and caps that go with a dose. */
  notes?: string[];
  /** A maintenance task: the card logs it done with its own form. */
  task?: { id: string; label: string };
  /** A warning (something is off) or critical (algae risk): the only cards in amber or red. */
  tone?: "warn" | "critical";
}

export interface AdviceAction {
  measure: string;
  severity: "act" | "watch" | "ok";
  title: string;
  detail: string;
  /** "1 qt of liquid chlorine 12.5%", the amount "1 qt", and the prefilled dose form. */
  dose?: { text: string; amount: string; href: string; notes: string[] } | null;
}

export interface ActionsInput {
  today: string;
  advice: AdviceAction[];
  /** The plan for today: a chlorine addition, or the salt cell setting and what is logged. */
  plan:
    | { kind: "add"; text: string; amount: string; href: string; floor: number; target: string }
    | {
        kind: "cell";
        percent: number;
        logged: number | null;
        href: string;
        needPpm: number | null;
        cellHours: number | null;
        /** The cell is set in levels 1 to this many: "level 5 of 8" instead of "62.5%". */
        levelCount?: number | null;
      }
    | null;
  /** When the plan leaves the target band: "At 50% free chlorine climbs above 5 ppm by Friday: lower the cell to 25% from Friday, then test." */
  band: { direction: "high" | "low"; text: string } | null;
  /** Measures to retest: never tested, past their retest age, or due within the week. */
  retests: Array<{ key: string; label: string; lastTestedOn: string | null; dueOn: string }>;
  /** Maintenance due: from the maintenance statuses; `pressureHigh` makes it due now, whatever the date. */
  maintenance: Array<{ id: string; label: string; daysLeft: number | null; nextDue: string | null; relative: string; pressureHigh?: boolean }>;
}

const CHLORINE_NOTE = "Add chlorine in the evening with the pump running, away from the skimmer, and never mix it with other products.";

function sentence(text: string): string {
  const t = text.trim();
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

/**
 * Everything to do, most urgent first. The first is the highlighted card: free chlorine
 * below its minimum, then anything else the latest test says to act on, today's plan,
 * a plan that leaves the target, things to watch, maintenance, then retests.
 */
export function todayActions(input: ActionsInput): TodayAction[] {
  const ranked: Array<TodayAction & { rank: number; order: number }> = [];
  let order = 0;
  const push = (rank: number, a: TodayAction) => ranked.push({ ...a, rank, order: order++ });

  const fcAct = input.advice.some((a) => a.measure === "fc" && a.severity === "act");
  for (const a of input.advice) {
    if (a.severity === "ok") continue;
    const dose = a.dose ?? null;
    push(a.severity === "act" ? (a.measure === "fc" ? 0 : 1) : 4, {
      id: `advice-${a.measure}`,
      title: dose ? `Add ${dose.text}` : a.title,
      why: dose ? `${sentence(a.title)} ${sentence(a.detail)}` : sentence(a.detail),
      pill: a.severity === "act" ? "Today" : "This week",
      // Below free chlorine's minimum is critical (the tile's "Too low"); other actions are warnings.
      tone: a.severity !== "act" ? undefined : a.measure === "fc" && /below the minimum/.test(a.title) ? "critical" : "warn",
      button: dose ? { label: `I added ${dose.amount}`, href: dose.href } : undefined,
      notes: dose?.notes.length ? dose.notes : undefined,
    });
  }

  const plan = input.plan;
  if (plan?.kind === "add" && !fcAct) {
    push(2, {
      id: "plan-add",
      title: `Add ${plan.text} this evening`,
      why: `On the plan, that keeps free chlorine at ${plan.floor.toFixed(1)} ppm or more until the next addition (target ${plan.target}).`,
      pill: "Today",
      button: { label: `I added ${plan.amount}`, href: plan.href },
      notes: [CHLORINE_NOTE],
    });
  } else if (plan?.kind === "cell" && plan.logged !== plan.percent) {
    const make = plan.needPpm !== null ? ` It needs to make about ${plan.needPpm.toFixed(1)} ppm of free chlorine a day` : "";
    const hours = plan.cellHours ? ` with the cell running ${plan.cellHours} h a day` : "";
    const setting = (percent: number) => cellSettingText(percent, plan.levelCount);
    push(2, {
      id: "plan-cell",
      title: plan.percent === 0 ? "Switch the salt cell off" : `Set the salt cell to ${setting(plan.percent)}`,
      why: `${plan.logged === null ? "No setting logged yet." : `It is logged at ${setting(plan.logged)}.`}${make ? `${make}${hours} for this week's weather.` : ""}`,
      pill: "Today",
      button: { label: plan.percent === 0 ? "I switched it off" : `I set it to ${setting(plan.percent)}`, href: plan.href },
    });
  }

  if (input.band) {
    const [why, what] = input.band.text.includes(": ") ? input.band.text.split(/: (.+)/) : ["", input.band.text];
    push(3, {
      id: "plan-band",
      title: sentence(what).replace(/^./, (c) => c.toUpperCase()).replace(/\.$/, ""),
      why: why ? sentence(why) : "On the plan for this week.",
      pill: input.band.direction === "low" ? "Today" : "This week",
      tone: input.band.direction === "low" ? "critical" : "warn",
    });
  }

  for (const m of input.maintenance) {
    const d = m.daysLeft;
    if (m.pressureHigh) {
      push(5, {
        id: `task-${m.id}`,
        title: m.label,
        why: "Due now: the filter pressure is up.",
        pill: d !== null && d < 0 ? "Overdue" : "Today",
        tone: "warn",
        task: { id: m.id, label: m.label },
      });
      continue;
    }
    push(d !== null && d <= 0 ? 5 : 7, {
      id: `task-${m.id}`,
      title: m.label,
      why: `Due ${m.relative}.`,
      pill: d === null || m.nextDue === null ? "This week" : d < 0 ? "Overdue" : d === 0 ? "Today" : `Around ${shortDate(m.nextDue)}`,
      tone: d !== null && d < 0 ? "warn" : undefined,
      task: { id: m.id, label: m.label },
    });
  }

  for (const r of input.retests) {
    push(6, {
      id: `retest-${r.key}`,
      title: `Test ${r.label.toLowerCase()}`,
      why: r.lastTestedOn
        ? `Last tested ${shortDate(r.lastTestedOn)}; it drifts over weeks, so a monthly test keeps the targets right.`
        : "Not tested yet; until it is, the targets assume a typical level.",
      pill: r.dueOn <= input.today ? "This week" : `Around ${shortDate(r.dueOn)}`,
    });
  }

  return ranked
    .sort((a, b) => a.rank - b.rank || a.order - b.order)
    .map((a) => {
      const action: TodayAction & { rank?: number; order?: number } = { ...a };
      delete action.rank;
      delete action.order;
      return action;
    });
}

/** Retests for the slow measures: never tested, or 30 days after the last test, within the coming week. */
export function retestsDue(
  last: Array<{ key: string; label: string; testedOn: string | null }>,
  today: string,
  everyDays = 30,
): ActionsInput["retests"] {
  const horizon = addDays(today, 7);
  return last.flatMap((m): ActionsInput["retests"] => {
    if (!m.testedOn) return [{ key: m.key, label: m.label, lastTestedOn: null, dueOn: today }];
    const dueOn = addDays(m.testedOn, everyDays);
    return dueOn <= horizon ? [{ key: m.key, label: m.label, lastTestedOn: m.testedOn, dueOn }] : [];
  });
}

export interface WeekCard {
  date: string;
  /** "Today", "Sat" */
  day: string;
  /** "Oct 3" */
  dateText: string;
  today: boolean;
  uv: { index: number; level: UvLevel } | null;
  /** "0.8 in · 52%", "Dry" */
  rain: string | null;
  /** "≈ 7.8" by evening, on the plan */
  fc: string | null;
  /** "Keep 25%", "Add 1 qt", "Test CYA" */
  actions: string[];
  /** Free chlorine may fall below the minimum even on the plan. */
  risk: boolean;
}

export interface WeekInput {
  today: string;
  units: Units;
  forecast: Array<{ date: string; uv_index_max: number | null; precipitation_mm: number | null; precipitation_probability?: number | null }>;
  plan: {
    kind: "manual" | "swg";
    /** `fcEnd` is null when the plan has no free chlorine line (a salt cell of unknown output). */
    days: Array<{ date: string; fcEnd: number | null; algaeRisk: boolean; add: string | null; cellPercent: number | null }>;
    /** The setting last logged, for "Keep" or "Set" on the first day. */
    loggedPercent: number | null;
    /** The cell is set in levels 1 to this many. */
    levelCount?: number | null;
  } | null;
  /** Short names of slow measures due for a test, by date: { "2026-10-06": ["CYA"] }. */
  tests: Record<string, string[]>;
}

const rain = rainLabel;

/** The week from today: one card per day with the forecast and the plan's action. */
export function weekCards(input: WeekInput): WeekCard[] {
  const forecast = new Map(input.forecast.map((f) => [f.date, f]));
  const plan = new Map((input.plan?.days ?? []).map((d) => [d.date, d]));
  const dates = [...new Set([...forecast.keys(), ...plan.keys()])].filter((d) => d >= input.today).sort().slice(0, 7);
  let previousPercent = input.plan?.loggedPercent ?? null;
  return dates.map((date) => {
    const f = forecast.get(date);
    const p = plan.get(date);
    const actions: string[] = [];
    if (p && input.plan?.kind === "swg" && p.cellPercent !== null) {
      const word = cellSettingText(p.cellPercent, input.plan.levelCount);
      actions.push(previousPercent === p.cellPercent ? `Keep ${word}` : p.cellPercent === 0 ? "Switch off" : `Set ${word}`);
      previousPercent = p.cellPercent;
    } else if (p && input.plan?.kind === "manual") {
      actions.push(p.add ? `Add ${p.add}` : "Nothing to add");
    }
    for (const t of input.tests[date] ?? []) actions.push(`Test ${t}`);
    const label = new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
    return {
      date,
      day: date === input.today ? "Today" : label,
      dateText: shortDate(date),
      today: date === input.today,
      uv: f?.uv_index_max === null || f?.uv_index_max === undefined ? null : { index: Math.round(f.uv_index_max), level: uvLevel(f.uv_index_max) },
      rain: f ? rain(f.precipitation_mm === null ? null : Number(f.precipitation_mm), f.precipitation_probability, input.units) : null,
      fc: p && p.fcEnd !== null ? `≈ ${p.fcEnd.toFixed(1)}` : null,
      actions,
      risk: Boolean(p?.algaeRisk),
    };
  });
}
