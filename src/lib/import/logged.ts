import type { FilterType } from "@/lib/equipment";
import { localInZone } from "@/lib/form-data";
import type { TaskId } from "@/lib/maintenance";
import { minuteKey, NUMBER_FIELDS, type ImportRow, type NumberField, type UpkeepKind } from "./readings";

/**
 * An import checked against what the pool already has: tests in the same minute (always
 * skipped), tests on the same day with the same results (near-duplicates, skipped unless
 * the owner says otherwise), and the upkeep the file marks as done (backwash events and
 * maintenance days not logged yet). Pure; the import route loads the rows.
 */

export interface LoggedReading {
  taken_at: string;
  values: Partial<Record<NumberField, number | null>>;
}

export interface NearDuplicate {
  line: number;
  /** The test already logged that matches. */
  loggedAt: string;
}

export interface ReadingSplit {
  fresh: ImportRow[];
  alreadyLogged: number;
  nearDuplicates: NearDuplicate[];
}

/** The day at the pool: "2026-09-26". */
export function poolDay(iso: string, timeZone: string): string {
  return localInZone(iso, timeZone).slice(0, 10);
}

/**
 * Whether two tests report the same results: every result both have agrees, and they
 * share at least two (or all of the imported row's, when it has only one). A result only
 * one of them has does not count against it: Pool Math rows often leave FC blank.
 */
export function sameResults(row: ImportRow["values"], logged: LoggedReading["values"]): boolean {
  const imported = NUMBER_FIELDS.filter((f) => row[f] !== undefined);
  const shared = imported.filter((f) => logged[f] !== undefined && logged[f] !== null);
  if (shared.length < Math.min(2, imported.length) || shared.length === 0) return false;
  return shared.every((f) => Math.abs(Number(logged[f]) - row[f]!) < 1e-6);
}

export function splitAgainstLogged(
  rows: ImportRow[],
  logged: LoggedReading[],
  timeZone: string,
  importNearDuplicates = false,
): ReadingSplit {
  const minutes = new Set(logged.map((r) => minuteKey(r.taken_at)));
  const byDay = new Map<string, LoggedReading[]>();
  for (const r of logged) {
    const day = poolDay(r.taken_at, timeZone);
    byDay.set(day, [...(byDay.get(day) ?? []), r]);
  }
  const fresh: ImportRow[] = [];
  const nearDuplicates: NearDuplicate[] = [];
  let alreadyLogged = 0;
  for (const row of rows) {
    if (minutes.has(minuteKey(row.taken_at))) {
      alreadyLogged += 1;
      continue;
    }
    const match = (byDay.get(poolDay(row.taken_at, timeZone)) ?? []).find((r) => sameResults(row.values, r.values));
    if (match) {
      nearDuplicates.push({ line: row.line, loggedAt: match.taken_at });
      if (!importNearDuplicates) continue;
    }
    fresh.push(row);
  }
  return { fresh, alreadyLogged, nearDuplicates };
}

/**
 * The maintenance task an upkeep column stands for, given the pool's filter: a backwash
 * is the sand or DE backwash task, a cleaned cartridge is a rinse, cleaned DE grids are
 * the grids task. A cartridge has no backwash, a sand filter is cleaned by backwashing
 * (its own column), and Tuffo has no vacuuming task, so those give null.
 */
export function upkeepTask(kind: UpkeepKind, filterType: FilterType | null): TaskId | null {
  if (kind === "backwash") {
    if (filterType === "sand") return "sand_backwash";
    if (filterType === "de") return "de_backwash";
  }
  if (kind === "filter_clean") {
    if (filterType === "cartridge") return "cartridge_rinse";
    if (filterType === "de") return "de_grids";
  }
  return null;
}

export interface UpkeepPlan {
  /** Backwash events to add, one per day at the time of that day's first row (and the
   * filter's backwash task in `maintenance`, for sand and DE). */
  events: { occurred_at: string }[];
  /** Maintenance days to add. */
  maintenance: { task: TaskId; done_on: string }[];
  /** Days the file marks, per kind (after merging rows on the same day). */
  days: Record<UpkeepKind, number>;
  /** Entries (events or maintenance days) already logged in Tuffo. */
  alreadyLogged: number;
  /** Days with no matching task for this pool (vacuuming; filter cleaning without one). */
  notTracked: number;
}

export function planUpkeep(
  rows: ImportRow[],
  options: {
    timeZone: string;
    filterType: FilterType | null;
    /** Days with a backwash event already. */
    backwashDays: Set<string>;
    /** "task|day" pairs already marked done. */
    doneDays: Set<string>;
  },
): UpkeepPlan {
  const plan: UpkeepPlan = { events: [], maintenance: [], days: { backwash: 0, filter_clean: 0, vacuum: 0 }, alreadyLogged: 0, notTracked: 0 };
  const seen = new Set<string>();
  const sorted = [...rows].sort((a, b) => Date.parse(a.taken_at) - Date.parse(b.taken_at));
  for (const row of sorted) {
    const day = poolDay(row.taken_at, options.timeZone);
    for (const kind of row.upkeep) {
      if (seen.has(`${kind}|${day}`)) continue;
      seen.add(`${kind}|${day}`);
      plan.days[kind] += 1;
      if (kind === "backwash") {
        if (options.backwashDays.has(day)) plan.alreadyLogged += 1;
        else plan.events.push({ occurred_at: row.taken_at });
      }
      const task = upkeepTask(kind, options.filterType);
      if (!task) {
        if (kind !== "backwash") plan.notTracked += 1; // a backwash still has its event
      } else if (options.doneDays.has(`${task}|${day}`)) plan.alreadyLogged += 1;
      else plan.maintenance.push({ task, done_on: day });
    }
  }
  return plan;
}
