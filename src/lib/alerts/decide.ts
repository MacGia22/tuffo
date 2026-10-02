/**
 * Which emails are due for one person today. Pure: the job loads the inputs and sends
 * at most one email per person per day, with every due alert in it.
 *
 * - Algae risk (from the 7-day plan): FC is estimated below the minimum now, or the plan
 *   flags today or tomorrow. At most once every 3 days per pool.
 * - Time to test: N days (the person picks; default 7) since the last test, once per gap.
 * - Weekly summary: on Saturdays.
 * - Maintenance: upkeep that is due or overdue, at most once a week per pool.
 */

export type AlertKind = "algae" | "test_reminder" | "weekly" | "maintenance";

export interface PoolAlertSettings {
  poolId: string;
  poolName: string;
  algae: boolean;
  testReminder: boolean;
  testAfterDays: number;
  weekly: boolean;
  maintenance?: boolean;
}

export interface PoolAlertState {
  poolId: string;
  /** Today in the pool's time zone (YYYY-MM-DD); the plan's dates are local. Defaults to the job's day. */
  today?: string;
  /** Last test of any kind, or null. */
  lastTestAt: string | null;
  plan: {
    fcStart: number;
    fcMin: number;
    /** Dates (YYYY-MM-DD) the plan flags as algae risk. */
    riskDates: string[];
  } | null;
  /** Upkeep due today or overdue: "Inspect the salt cell (3 days overdue)". */
  maintenanceDue?: string[];
}

export interface SentAlert {
  poolId: string | null;
  kind: AlertKind;
  sentOn: string; // YYYY-MM-DD
}

export interface DueAlert {
  poolId: string;
  poolName: string;
  kind: AlertKind;
  /**
   * Algae: the first risky date, or today when FC is already estimated low. Reminder: days
   * since the test. Maintenance: the tasks due.
   */
  detail: { date?: string; days?: number; tasks?: string[] };
}

export const ALGAE_REPEAT_DAYS = 3;
export const WEEKLY_DAY = 6; // Saturday
export const MAINTENANCE_REPEAT_DAYS = 7;

const DAY_MS = 86_400_000;

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

export function dueAlerts(input: {
  today: string;
  now: number;
  settings: PoolAlertSettings[];
  state: PoolAlertState[];
  sent: SentAlert[];
}): DueAlert[] {
  const { today } = input;
  // One email a day per person: nothing if one already went today.
  if (input.sent.some((s) => s.sentOn === today)) return [];
  const due: DueAlert[] = [];

  for (const s of input.settings) {
    const state = input.state.find((p) => p.poolId === s.poolId);
    const sentFor = (kind: AlertKind) => input.sent.filter((x) => x.poolId === s.poolId && x.kind === kind);
    // The pool's own day: at 11:30 UTC Auckland is already on tomorrow, Honolulu still on today.
    const poolToday = state?.today ?? today;
    const weekday = new Date(`${poolToday}T12:00:00Z`).getUTCDay();

    if (s.algae && state?.plan) {
      const soon = [poolToday, addDays(poolToday, 1)];
      const riskNow = state.plan.fcStart < state.plan.fcMin;
      const riskDate = riskNow ? poolToday : state.plan.riskDates.find((d) => soon.includes(d));
      const recent = sentFor("algae").some((x) => daysBetween(x.sentOn, today) < ALGAE_REPEAT_DAYS);
      if (riskDate && !recent) due.push({ poolId: s.poolId, poolName: s.poolName, kind: "algae", detail: { date: riskDate } });
    }

    if (s.testReminder && state?.lastTestAt) {
      const days = Math.floor((input.now - Date.parse(state.lastTestAt)) / DAY_MS);
      const lastTestDay = new Date(state.lastTestAt).toISOString().slice(0, 10);
      // A reminder can't come after a test the same day (it needs days to pass), so one
      // sent that day was for the previous gap.
      const remindedSinceTest = sentFor("test_reminder").some((x) => x.sentOn > lastTestDay);
      if (days >= s.testAfterDays && !remindedSinceTest) {
        due.push({ poolId: s.poolId, poolName: s.poolName, kind: "test_reminder", detail: { days } });
      }
    }

    if (s.weekly && weekday === WEEKLY_DAY && !sentFor("weekly").some((x) => daysBetween(x.sentOn, today) < 6)) {
      due.push({ poolId: s.poolId, poolName: s.poolName, kind: "weekly", detail: {} });
    }

    const tasks = state?.maintenanceDue ?? [];
    if (s.maintenance && tasks.length > 0) {
      const recent = sentFor("maintenance").some((x) => daysBetween(x.sentOn, today) < MAINTENANCE_REPEAT_DAYS);
      if (!recent) due.push({ poolId: s.poolId, poolName: s.poolName, kind: "maintenance", detail: { tasks } });
    }
  }
  return due;
}
