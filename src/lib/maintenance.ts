/**
 * Pool upkeep: which tasks a pool's equipment needs, how often (a typical default the
 * owner can change), when each is next due, filter pressure against its clean pressure,
 * and how much of its life a piece of equipment has used. Browser-safe and pure: the
 * pages and the alert job load the rows and call these.
 *
 * Intervals and lives are typical figures from makers' manuals and pool-care guides, not
 * promises; the copy says "about" and "typical".
 */

import type { FeederType, FilterType, HeaterType } from "@/lib/equipment";

export type TaskId =
  | "cell_clean"
  | "pump_basket"
  | "pump_oring"
  | "cartridge_rinse"
  | "cartridge_replace"
  | "sand_backwash"
  | "sand_replace"
  | "de_backwash"
  | "de_grids"
  | "heater_service"
  | "feeder_refill";

export type TaskEquipment = "cell" | "pump" | "filter" | "heater" | "feeder";

export interface MaintenanceTask {
  id: TaskId;
  label: string;
  /** A few words for chips: "hose off". */
  short: string;
  equipment: TaskEquipment;
  /** Default interval, days. */
  defaultDays: number;
  /** What guides usually say, for the settings copy. */
  typical: string;
  /** Also due when the filter pressure has risen this far above its clean pressure. */
  pressure?: boolean;
  /** One line on how, with the care it needs. */
  how: string;
}

export const MAINTENANCE_TASKS: MaintenanceTask[] = [
  {
    id: "cell_clean",
    short: "inspect",
    label: "Inspect the salt cell",
    equipment: "cell",
    defaultDays: 90,
    typical: "every 3 months",
    how: "Power the cell off and look inside. Clean only if you see scale, as the manual says; if it calls for acid, add acid to water (never water to acid), outdoors, with gloves and eye protection.",
  },
  {
    id: "pump_basket",
    short: "empty basket",
    label: "Empty the pump basket",
    equipment: "pump",
    defaultDays: 7,
    typical: "every week",
    how: "Turn the pump off first, empty the basket, check the lid O-ring is seated.",
  },
  {
    id: "pump_oring",
    short: "lube O-ring",
    label: "Lube the pump lid O-ring",
    equipment: "pump",
    defaultDays: 365,
    typical: "every year",
    how: "Clean it and use a silicone pool lubricant (not petroleum jelly); replace it if it is cracked or flat.",
  },
  {
    id: "cartridge_rinse",
    short: "hose off",
    label: "Hose off the filter cartridge",
    equipment: "filter",
    defaultDays: 35,
    typical: "every 4 to 6 weeks, or when the pressure is 8 to 10 psi over clean",
    pressure: true,
    how: "Pump off, release the air, then rinse the cartridge top to bottom between the pleats.",
  },
  {
    id: "cartridge_replace",
    short: "new cartridge",
    label: "Replace the filter cartridge",
    equipment: "filter",
    defaultDays: 540,
    typical: "every 1 to 2 years",
    how: "Sooner if the pleats are torn or flat, or the pressure stays high right after a rinse.",
  },
  {
    id: "sand_backwash",
    short: "backwash",
    label: "Backwash the sand filter",
    equipment: "filter",
    defaultDays: 30,
    typical: "when the pressure is 8 to 10 psi over clean",
    pressure: true,
    how: "Pump off before moving the valve. Backwash until the sight glass runs clear, then rinse.",
  },
  {
    id: "sand_replace",
    short: "new sand",
    label: "Replace the filter sand",
    equipment: "filter",
    defaultDays: 2190,
    typical: "every 5 to 7 years",
    how: "Sooner if backwashes get short or the water stays cloudy with good chemistry.",
  },
  {
    id: "de_backwash",
    short: "backwash + DE",
    label: "Backwash and recharge the DE filter",
    equipment: "filter",
    defaultDays: 30,
    typical: "when the pressure is 8 to 10 psi over clean",
    pressure: true,
    how: "Pump off before moving the valve. Backwash, then add fresh DE through the skimmer as the filter's label says. Wear a dust mask.",
  },
  {
    id: "de_grids",
    short: "clean grids",
    label: "Clean the DE filter grids",
    equipment: "filter",
    defaultDays: 365,
    typical: "every year",
    how: "Take the grids out and hose them off; replace any that are torn.",
  },
  {
    id: "heater_service",
    short: "service",
    label: "Service the heater",
    equipment: "heater",
    defaultDays: 365,
    typical: "every year",
    how: "A technician's check before the season.",
  },
  {
    id: "feeder_refill",
    short: "refill",
    label: "Refill the chlorine feeder",
    equipment: "feeder",
    defaultDays: 7,
    typical: "set it to how long yours lasts",
    how: "Refill with the product the feeder is made for, and only that one; never mix different chlorine products.",
  },
];

export function taskById(id: string): MaintenanceTask | undefined {
  return MAINTENANCE_TASKS.find((t) => t.id === id);
}

export interface MaintenancePool {
  sanitizer: "chlorine" | "swg";
  hasPump: boolean;
  filterType: FilterType | null;
  heaterType: HeaterType | null;
  feederType: FeederType | null;
}

const FILTER_TASKS: Record<FilterType, TaskId[]> = {
  cartridge: ["cartridge_rinse", "cartridge_replace"],
  sand: ["sand_backwash", "sand_replace"],
  de: ["de_backwash", "de_grids"],
};

/** The tasks that apply to a pool's equipment, in catalog order. */
export function tasksFor(pool: MaintenancePool): MaintenanceTask[] {
  const ids = new Set<TaskId>();
  if (pool.sanitizer === "swg") ids.add("cell_clean");
  if (pool.hasPump) {
    ids.add("pump_basket");
    ids.add("pump_oring");
  }
  for (const id of pool.filterType ? FILTER_TASKS[pool.filterType] : []) ids.add(id);
  if (pool.heaterType && pool.heaterType !== "solar") ids.add("heater_service");
  if (pool.feederType) ids.add("feeder_refill");
  return MAINTENANCE_TASKS.filter((t) => ids.has(t.id));
}

export const MIN_INTERVAL_DAYS = 1;
export const MAX_INTERVAL_DAYS = 3650;

function validDays(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= MIN_INTERVAL_DAYS && value <= MAX_INTERVAL_DAYS;
}

/** The owner's interval for a task, or the default. `overrides` is pools.maintenance_intervals. */
export function intervalFor(task: MaintenanceTask, overrides: unknown): number {
  const value = overrides && typeof overrides === "object" ? (overrides as Record<string, unknown>)[task.id] : undefined;
  return validDays(value) ? value : task.defaultDays;
}

export const INTERVAL_UNITS = [
  { value: "days", label: "days", days: 1 },
  { value: "weeks", label: "weeks", days: 7 },
  { value: "months", label: "months", days: 30 },
  { value: "years", label: "years", days: 365 },
] as const;

export type IntervalUnit = (typeof INTERVAL_UNITS)[number]["value"];

/** An interval from the form's number and unit, in days; null when out of range. */
export function intervalFromForm(count: string | null, unit: string | null): number | null {
  const n = Number((count ?? "").trim());
  const u = INTERVAL_UNITS.find((x) => x.value === unit);
  if (!u || !Number.isFinite(n) || n <= 0) return null;
  const days = Math.round(n * u.days);
  return validDays(days) ? days : null;
}

/** An interval split into the largest whole unit, for the form and the copy. */
export function splitInterval(days: number): { count: number; unit: IntervalUnit } {
  for (const u of [...INTERVAL_UNITS].reverse()) {
    if (u.days > 1 && days % u.days === 0) return { count: days / u.days, unit: u.value };
  }
  return { count: days, unit: "days" };
}

/** "every week", "every 3 months", "every 2 years". */
export function describeInterval(days: number): string {
  const { count, unit } = splitInterval(days);
  const singular = unit.slice(0, -1);
  if (count === 1) return unit === "days" ? "every day" : `every ${singular}`;
  return `every ${count} ${unit}`;
}

const DAY_MS = 86_400_000;

function dayNumber(date: string): number {
  return Math.round(Date.parse(`${date.slice(0, 10)}T00:00:00Z`) / DAY_MS);
}

export function addDays(date: string, days: number): string {
  return new Date((dayNumber(date) + days) * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from);
}

export interface PressureReading {
  readOn: string;
  kpa: number;
  clean: boolean;
}

/** A rise of 8 psi (55 kPa) over the clean pressure: time to clean the filter. */
export const PRESSURE_RISE_KPA = 55;

export interface PressureStatus {
  latest: PressureReading;
  /** The last reading marked clean, at or before the latest. */
  clean: PressureReading | null;
  /** Latest minus clean, kPa; null without a clean reading. */
  riseKpa: number | null;
  high: boolean;
}

/**
 * The filter's pressure now against its clean pressure. Readings may come in any order;
 * readings before `since` (the filter's install date) are ignored. Null without readings.
 */
export function pressureStatus(readings: PressureReading[], since: string | null = null): PressureStatus | null {
  const list = readings
    .filter((r) => Number.isFinite(r.kpa) && (!since || r.readOn >= since))
    .map((r, i) => ({ r, i }))
    // Oldest first; the same day keeps the order given (logged order).
    .sort((a, b) => (a.r.readOn === b.r.readOn ? a.i - b.i : a.r.readOn < b.r.readOn ? -1 : 1))
    .map((x) => x.r);
  if (list.length === 0) return null;
  const latest = list[list.length - 1];
  const clean = [...list].reverse().find((r) => r.clean) ?? null;
  const riseKpa = clean ? Math.round((latest.kpa - clean.kpa) * 10) / 10 : null;
  return { latest, clean, riseKpa, high: riseKpa !== null && riseKpa >= PRESSURE_RISE_KPA };
}

export type TaskState = "overdue" | "due" | "soon" | "ok" | "unknown";

export interface TaskStatus {
  task: MaintenanceTask;
  intervalDays: number;
  lastDone: string | null;
  nextDue: string | null;
  /** Days from today to the next due date (negative: overdue). */
  daysLeft: number | null;
  /** Due because the filter pressure is high (since the last time it was done). */
  pressureHigh: boolean;
  state: TaskState;
}

/** Due within this many days counts as "soon" (at most a week, or a tenth of the interval). */
export function soonWindow(intervalDays: number): number {
  return Math.max(1, Math.min(7, Math.round(intervalDays / 10)));
}

export interface MaintenanceInput {
  pool: MaintenancePool;
  overrides: unknown;
  /** Every logged completion, any order. */
  done: { task: string; doneOn: string }[];
  pressure: PressureStatus | null;
  today: string;
  /**
   * When each current item was installed (YYYY-MM-DD). Completions before it belonged to
   * the item it replaced, and a "replace" task counts the install as done (within one interval).
   */
  installedOn?: Partial<Record<TaskEquipment, string | null>>;
}

/** The status of each task that applies, most urgent first. */
export function maintenanceStatus(input: MaintenanceInput): TaskStatus[] {
  const rank: Record<TaskState, number> = { overdue: 0, due: 1, soon: 2, ok: 3, unknown: 4 };
  return tasksFor(input.pool)
    .map((task): TaskStatus => {
      const intervalDays = intervalFor(task, input.overrides);
      const installed = input.installedOn?.[task.equipment] ?? null;
      const logged =
        input.done
          .filter((d) => d.task === task.id && d.doneOn <= input.today && (!installed || d.doneOn.slice(0, 10) >= installed))
          .map((d) => d.doneOn.slice(0, 10))
          .sort()
          .pop() ?? null;
      // A new item comes with a new cartridge or sand, so its install counts as the last
      // replacement while that is within one interval; an older item may have had one since.
      const fromInstall =
        installed && task.id.endsWith("_replace") && installed <= input.today && addDays(installed, intervalDays) >= input.today
          ? installed
          : null;
      const lastDone = logged ?? fromInstall;
      const p = input.pressure;
      const pressureHigh = Boolean(task.pressure && p?.high && (!lastDone || p.latest.readOn >= lastDone));
      const nextDue = lastDone ? addDays(lastDone, intervalDays) : null;
      const daysLeft = nextDue ? daysBetween(input.today, nextDue) : null;
      let state: TaskState;
      if (daysLeft !== null && daysLeft < 0) state = "overdue";
      else if (pressureHigh || daysLeft === 0) state = "due";
      else if (daysLeft === null) state = "unknown";
      else if (daysLeft <= soonWindow(intervalDays)) state = "soon";
      else state = "ok";
      return { task, intervalDays, lastDone, nextDue, daysLeft, pressureHigh, state };
    })
    .sort((a, b) => rank[a.state] - rank[b.state] || (a.daysLeft ?? 0) - (b.daysLeft ?? 0));
}

/** The tasks to show on the pool page and in the reminder email. */
export function dueTasks(statuses: TaskStatus[]): TaskStatus[] {
  return statuses.filter((s) => s.state === "overdue" || s.state === "due" || s.state === "soon");
}

/** "due today", "3 days overdue", "due in 2 days", "due Mar 4", "not logged yet". */
export function dueText(s: TaskStatus): string {
  if (s.pressureHigh && (s.daysLeft === null || s.daysLeft >= 0)) return "due now: filter pressure is up";
  if (s.daysLeft === null || s.nextDue === null) return "not logged yet";
  if (s.daysLeft < 0) return `${-s.daysLeft} ${s.daysLeft === -1 ? "day" : "days"} overdue`;
  if (s.daysLeft === 0) return "due today";
  if (s.daysLeft === 1) return "due tomorrow";
  if (s.daysLeft <= 14) return `due in ${s.daysLeft} days`;
  const date = new Date(`${s.nextDue}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  return `due ${date}`;
}

export interface ScheduleSpan {
  /** The pool's local date it took effect (an ISO instant is read by its UTC date). */
  from: string;
  /** Hours a day the cell runs (the pump hours it is on). */
  hours: number;
}

export interface SettingChange {
  at: string;
  /** Output setting, percent. */
  percent: number;
}

export interface CellHours {
  hours: number;
  /** Days before the first logged schedule were counted with that first schedule. */
  extrapolated: boolean;
}

/**
 * About how many hours the cell has made chlorine since it was installed: each day, the
 * pump hours in force times the output setting in force (a cell at 50% is on about half
 * the time; no setting logged counts as 100%). Days before the first logged schedule use
 * the first one. Null without a schedule, or an install date after today.
 */
export function cellHoursUsed(input: {
  installedOn: string;
  today: string;
  schedules: ScheduleSpan[];
  settings: SettingChange[];
}): CellHours | null {
  // By day; the sort is stable, so of two changes the same day the later in the input (the
  // caller passes them oldest first) is the one in force.
  const schedules = input.schedules
    .filter((s) => Number.isFinite(s.hours) && s.hours >= 0)
    .map((s) => ({ day: s.from.slice(0, 10), hours: Math.min(24, s.hours) }))
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  if (schedules.length === 0) return null;
  const settings = input.settings
    .filter((s) => Number.isFinite(s.percent))
    .map((s) => ({ day: s.at.slice(0, 10), share: Math.max(0, Math.min(100, s.percent)) / 100 }))
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  const days = daysBetween(input.installedOn, input.today);
  if (days < 0) return null;

  // Walk day by day; the value in force on a day is the last change on or before it.
  let total = 0;
  let si = -1;
  let pi = -1;
  let extrapolated = false;
  for (let d = 0; d < days; d += 1) {
    const day = addDays(input.installedOn, d);
    while (si + 1 < schedules.length && schedules[si + 1].day <= day) si += 1;
    while (pi + 1 < settings.length && settings[pi + 1].day <= day) pi += 1;
    if (si < 0) extrapolated = true;
    const hours = schedules[Math.max(0, si)].hours;
    const share = pi >= 0 ? settings[pi].share : settings.length > 0 ? settings[0].share : 1;
    total += hours * share;
  }
  return { hours: Math.round(total), extrapolated };
}

/** Typical service life, years, by equipment. */
export const TYPICAL_LIFE_YEARS: Record<string, [number, number]> = {
  cell: [3, 7],
  pump: [8, 12],
  filter: [10, 15],
  heater_gas: [5, 10],
  heater_heat_pump: [10, 15],
  heater_electric: [10, 15],
  heater_solar: [10, 20],
  feeder: [5, 10],
};

export function ageYears(installedOn: string, today: string): number {
  return Math.max(0, daysBetween(installedOn, today) / 365.25);
}

/** "8 months", "1 year", "3.5 years". */
export function formatAge(years: number): string {
  const months = Math.max(0, Math.round(years * 12));
  if (months < 12) {
    return months <= 1 ? (months === 0 ? "under a month" : "1 month") : `${months} months`;
  }
  const rounded = Math.round(years * 2) / 2;
  return rounded === 1 ? "1 year" : `${rounded} years`;
}

export type LifeState = "fine" | "late" | "past";

/** Within a typical life, in its later part (past the low end), or past the high end. */
export function lifeState(years: number, life: [number, number]): LifeState {
  if (years > life[1]) return "past";
  if (years >= life[0]) return "late";
  return "fine";
}

export interface LifeUsed {
  percent: number;
  state: LifeState;
}

/** Hours used against the rating: "late" from 80%, "past" over 100%. */
export function hoursLife(hours: number, ratedHours: number): LifeUsed | null {
  if (!(ratedHours > 0) || !(hours >= 0)) return null;
  const percent = Math.round((hours / ratedHours) * 100);
  return { percent, state: percent > 100 ? "past" : percent >= 80 ? "late" : "fine" };
}

export type Tone = "good" | "warning" | "critical";

/**
 * How much of a task's interval has gone by, 0 to 1 (above 1 when overdue), and its
 * tone: under 80% good, 80–100% warning, overdue critical. Null before it is logged.
 */
export function intervalProgress(s: Pick<TaskStatus, "daysLeft" | "intervalDays" | "pressureHigh" | "state">): {
  share: number;
  tone: Tone;
} | null {
  if (s.daysLeft === null) return s.pressureHigh ? { share: 1, tone: "warning" } : null;
  const share = (s.intervalDays - s.daysLeft) / s.intervalDays;
  const tone: Tone = s.state === "overdue" ? "critical" : share >= 0.8 || s.pressureHigh ? "warning" : "good";
  return { share: Math.max(0, share), tone };
}

export interface DueDay {
  date: string;
  /** Tasks due that day; overdue ones are listed on today. */
  tasks: { label: string; overdue: boolean }[];
}

/** The next `days` days from today, with the tasks falling due on each. */
export function dueCalendar(statuses: TaskStatus[], today: string, days = 30): DueDay[] {
  const out: DueDay[] = Array.from({ length: days }, (_, i) => ({ date: addDays(today, i), tasks: [] }));
  for (const s of statuses) {
    if (s.nextDue === null) {
      if (s.pressureHigh) out[0].tasks.push({ label: s.task.label, overdue: false });
      continue;
    }
    const offset = daysBetween(today, s.nextDue);
    // Due now because the filter pressure is up: today, whatever the calendar says.
    if (s.pressureHigh && offset >= 0) {
      out[0].tasks.push({ label: s.task.label, overdue: false });
      continue;
    }
    if (offset < 0) out[0].tasks.push({ label: s.task.label, overdue: true });
    else if (offset < days) out[offset].tasks.push({ label: s.task.label, overdue: false });
  }
  return out;
}

export interface LifeSpan {
  ageYears: number;
  /** Typical life, years: the replacement window runs from low to high. */
  low: number;
  high: number;
  /** Age as a share of the high end, capped at 1.2 for drawing. */
  share: number;
  state: LifeState;
  /** "about 4 years left", "replacement window now", "past a typical life". */
  left: string;
}

/** An item's age against its typical life, for the lifespan bar. */
export function lifeSpan(installedOn: string, today: string, life: [number, number]): LifeSpan {
  const age = ageYears(installedOn, today);
  const state = lifeState(age, life);
  const mid = (life[0] + life[1]) / 2;
  const leftYears = mid - age;
  const left =
    state === "past"
      ? "past a typical life"
      : state === "late"
        ? "in the usual replacement window"
        : leftYears >= 1.5
          ? `about ${Math.round(leftYears)} years left`
          : `about ${Math.max(1, Math.round(leftYears * 12))} months left`;
  return { ageYears: age, low: life[0], high: life[1], share: Math.min(1.2, age / life[1]), state, left };
}

/**
 * When the cell's rated hours run out at today's pace (pump hours a day times the
 * setting): "Mar 2029". Null without a rating, a pace, or with the rating used up.
 */
export function cellReplacementMonth(input: {
  hoursUsed: number;
  ratedHours: number | null;
  hoursPerDay: number | null;
  today: string;
}): string | null {
  const { hoursUsed, ratedHours, hoursPerDay } = input;
  if (!ratedHours || !hoursPerDay || hoursPerDay <= 0 || hoursUsed >= ratedHours) return null;
  const days = Math.round((ratedHours - hoursUsed) / hoursPerDay);
  if (days > 365 * 30) return null;
  return new Date(`${addDays(input.today, days)}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** The life-used items for the pool page's health row. */
export function healthItems(input: {
  today: string;
  cell: { installedOn: string | null; hoursUsed: number | null; ratedHours: number | null } | null;
  equipment: { kind: string; type: string | null; installedOn: string; label: string }[];
}): { label: string; share: number; tone: Tone; text: string }[] {
  const out: { label: string; share: number; tone: Tone; text: string }[] = [];
  const toneOf = (state: LifeState): Tone => (state === "fine" ? "good" : state === "late" ? "warning" : "critical");
  const c = input.cell;
  if (c?.installedOn) {
    if (c.hoursUsed !== null && c.ratedHours) {
      const used = hoursLife(c.hoursUsed, c.ratedHours);
      if (used) out.push({ label: "Salt cell", share: used.percent / 100, tone: toneOf(used.state), text: `${used.percent}% of rated hours` });
    } else {
      const span = lifeSpan(c.installedOn, input.today, TYPICAL_LIFE_YEARS.cell);
      out.push({ label: "Salt cell", share: span.ageYears / span.high, tone: toneOf(span.state), text: span.left });
    }
  }
  for (const e of input.equipment) {
    const life = TYPICAL_LIFE_YEARS[e.kind === "heater" ? `heater_${e.type ?? "gas"}` : e.kind];
    if (!life) continue;
    const span = lifeSpan(e.installedOn, input.today, life);
    out.push({ label: e.label, share: span.ageYears / span.high, tone: toneOf(span.state), text: span.left });
  }
  return out;
}

/**
 * The due date in one format for every card: a relative line ("in 5 days", "in 4 weeks",
 * "in 15 months", "today", "3 days overdue") and the date as a second line ("Oct 31";
 * with the year when it is not this year).
 */
export function dueParts(s: Pick<TaskStatus, "daysLeft" | "nextDue" | "pressureHigh">, today: string): {
  relative: string;
  date: string | null;
} {
  if (s.pressureHigh && (s.daysLeft === null || s.daysLeft >= 0)) return { relative: "now", date: "filter pressure is up" };
  if (s.daysLeft === null || s.nextDue === null) return { relative: "not set", date: null };
  const d = s.daysLeft;
  const relative =
    d < 0
      ? `${-d} ${d === -1 ? "day" : "days"} overdue`
      : d === 0
        ? "today"
        : d === 1
          ? "tomorrow"
          : d <= 13
            ? `in ${d} days`
            : d <= 56
              ? `in ${Math.round(d / 7)} weeks`
              : `in ${Math.max(2, Math.round(d / 30.44))} months`;
  const sameYear = s.nextDue.slice(0, 4) === today.slice(0, 4);
  const date = new Date(`${s.nextDue}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone: "UTC",
  });
  return { relative, date };
}

/** Tasks more than this many days out go under "Later". */
export const LATER_DAYS = 90;

/** The maintenance list: never logged first, then by urgency, then the far-off ones. */
export function groupTasks(statuses: TaskStatus[]): { start: TaskStatus[]; soon: TaskStatus[]; later: TaskStatus[] } {
  const start = statuses.filter((s) => s.state === "unknown" && !s.pressureHigh);
  const rest = statuses.filter((s) => !start.includes(s));
  // A task due now from high filter pressure is never "later", however far its date.
  return {
    start,
    soon: rest.filter((s) => s.pressureHigh || s.daysLeft === null || s.daysLeft <= LATER_DAYS),
    later: rest.filter((s) => !s.pressureHigh && s.daysLeft !== null && s.daysLeft > LATER_DAYS),
  };
}

/** The card's status pill: Overdue, Due soon or OK; none before a start date. */
export function statusTone(s: Pick<TaskStatus, "state">): Tone | null {
  if (s.state === "overdue") return "critical";
  if (s.state === "due" || s.state === "soon") return "warning";
  if (s.state === "ok") return "good";
  return null;
}

/**
 * The next task for one piece of equipment, as a chip: "Next: hose off · Oct 31",
 * "Overdue: inspect · Sep 8", or "Set a start date: hose off". Null without tasks.
 */
export function nextTaskChip(statuses: TaskStatus[], equipment: TaskEquipment, today: string): { text: string; tone: Tone | null } | null {
  const mine = statuses.filter((s) => s.task.equipment === equipment);
  if (mine.length === 0) return null;
  const dated = mine
    .filter((s) => s.nextDue !== null || s.pressureHigh)
    .sort((a, b) => (a.pressureHigh ? -1 : b.pressureHigh ? 1 : (a.daysLeft ?? 0) - (b.daysLeft ?? 0)));
  const first = dated[0];
  if (!first) return { text: `Set a start date: ${mine[0].task.short}`, tone: null };
  const due = dueParts(first, today);
  if (first.pressureHigh && (first.daysLeft === null || first.daysLeft >= 0)) return { text: `Due now: ${first.task.short} · pressure up`, tone: "warning" };
  if (first.state === "overdue") return { text: `Overdue: ${first.task.short} · ${due.date}`, tone: "critical" };
  return { text: `Next: ${first.task.short} · ${due.date}`, tone: statusTone(first) };
}

/** Install years offered when the owner is not sure of the date: "about N years ago". */
export const ABOUT_YEARS = [1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 15, 20] as const;

/**
 * The install date from the form: an exact day, or "about N years ago" counted back from
 * today (same month and day; Feb 29 falls back to Feb 28). Null when neither is given or
 * the date is invalid or in the future.
 */
export function installDateFrom(since: string, aboutYears: string, today: string): string | null {
  if (since) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(since) || since > today) return null;
    // A real day: Date.parse reads "2026-02-30" as March 2.
    const t = Date.parse(`${since}T00:00:00Z`);
    return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === since ? since : null;
  }
  const years = Number(aboutYears);
  if (!aboutYears || !Number.isInteger(years) || years < 1 || years > 40) return null;
  const [y, m, d] = today.split("-").map(Number);
  const back = new Date(Date.UTC(y - years, m - 1, d));
  if (back.getUTCMonth() !== m - 1) back.setUTCDate(0); // Feb 29 in a non-leap year
  return back.toISOString().slice(0, 10);
}

export interface InstallConflict {
  task: MaintenanceTask;
  doneOn: string;
}

/**
 * Upkeep logged before an item was installed, when no earlier item of the same kind was
 * in place that day: likely a wrong install date (or a wrong log entry). Earliest first.
 */
export function installConflicts(input: {
  equipment: TaskEquipment;
  installedOn: string;
  /** Earlier items of the same kind, from the equipment history. */
  earlier: { installedOn: string; removedOn: string }[];
  history: { task: string; doneOn: string }[];
}): InstallConflict[] {
  const covered = (day: string) => input.earlier.some((e) => e.installedOn <= day && day <= e.removedOn);
  return input.history
    .map((h) => ({ task: MAINTENANCE_TASKS.find((t) => t.id === h.task), doneOn: h.doneOn }))
    .filter((h): h is InstallConflict => Boolean(h.task) && h.task!.equipment === input.equipment)
    .filter((h) => h.doneOn < input.installedOn && !covered(h.doneOn))
    .sort((a, b) => (a.doneOn < b.doneOn ? -1 : a.doneOn > b.doneOn ? 1 : 0));
}
