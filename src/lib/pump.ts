/**
 * Pump schedules: runs in a day with their times and whether the salt cell makes chlorine
 * during each. Safe in client components (the schedule form shows the hours as you type).
 */

export interface PumpSegment {
  /** "HH:MM", local time. */
  start: string;
  end: string;
  /** Whether the cell makes chlorine in this run (off at speeds too low for its flow switch). */
  cell: boolean;
  /** Pump speed or flow as the pump is set, for the person's reference only. */
  speed?: number | null;
  unit?: SpeedUnit;
}

/**
 * How a pump's runs are set, as its own control shows them: speed in RPM, flow in US
 * gallons or litres per minute, speed in percent, or a numbered speed (1, 2, 3…; many
 * Australian pumps). Stored with each run as entered; for reference and the cell guess only.
 */
export type SpeedUnit = "rpm" | "gpm" | "lpm" | "pct" | "level";

export interface SpeedUnitInfo {
  value: SpeedUnit;
  /** In "The pump is set by …". */
  label: string;
  /** The field's label. */
  field: string;
  placeholder: string;
  max: number;
  integer: boolean;
  /** Below this, many salt cells see too little flow and stay off; null: no guess. */
  low: number | null;
  /** The allowed range, for the error message. */
  range: string;
}

export const SPEED_UNITS: SpeedUnitInfo[] = [
  { value: "rpm", label: "speed (RPM)", field: "Speed (RPM, optional)", placeholder: "2400", max: 5000, integer: true, low: 1500, range: "speed is 0 to 5,000 RPM" },
  { value: "gpm", label: "flow (GPM)", field: "Flow (GPM, optional)", placeholder: "35", max: 200, integer: false, low: 20, range: "flow is 0 to 200 GPM" },
  // 20 GPM is about 75 L/min.
  { value: "lpm", label: "flow (L/min)", field: "Flow (L/min, optional)", placeholder: "130", max: 760, integer: false, low: 75, range: "flow is 0 to 760 L/min" },
  { value: "pct", label: "speed (%)", field: "Speed (%, optional)", placeholder: "60", max: 100, integer: false, low: null, range: "speed is 0 to 100%" },
  { value: "level", label: "speed number (1, 2, 3…)", field: "Speed number (optional)", placeholder: "3", max: 20, integer: true, low: null, range: "the speed number is a whole number up to 20" },
];

export function speedUnitInfo(unit: SpeedUnit): SpeedUnitInfo {
  return SPEED_UNITS.find((u) => u.value === unit) ?? SPEED_UNITS[0];
}

export function isSpeedUnit(value: unknown): value is SpeedUnit {
  return SPEED_UNITS.some((u) => u.value === value);
}

/** Below these, many salt cells see too little flow and stay off; only a first guess. */
export const LOW_RPM = 1500;
export const LOW_GPM = 20;

/** Percent and numbered speeds give no flow to guess from: the cell is assumed on. */
export function cellLikelyOn(speed: number | null, unit: SpeedUnit): boolean {
  const low = speedUnitInfo(unit).low;
  if (speed === null || low === null) return true;
  return speed >= low;
}

/** "2400 RPM", "35 GPM", "130 L/min", "60%", "speed 3". */
export function speedText(speed: number, unit: SpeedUnit | undefined): string {
  switch (unit) {
    case "gpm":
      return `${speed} GPM`;
    case "lpm":
      return `${speed} L/min`;
    case "pct":
      return `${speed}%`;
    case "level":
      return `speed ${speed}`;
    default:
      return `${speed} RPM`;
  }
}

/** "Runs under 1,500 RPM", for the note under a scan; null when no speed rule applies. */
export function lowRunsText(unit: SpeedUnit): string | null {
  const low = speedUnitInfo(unit).low;
  return low === null ? null : `Runs under ${speedText(low, unit).replace(/^1500 /, "1,500 ")}`;
}

function minutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 24 || mi > 59 || (h === 24 && mi > 0)) return null;
  return h * 60 + mi;
}

/**
 * Hours a day the cell runs: the union of the runs with the cell on, so overlapping runs
 * count once; a run past midnight ("22:00"–"02:00") wraps. Null when a time is malformed.
 */
export function cellHoursPerDay(segments: PumpSegment[]): number | null {
  return coveredHours(segments, true);
}

/** Hours a day the pump runs, whatever the cell does: the union of all runs. */
export function pumpHoursPerDay(segments: PumpSegment[]): number | null {
  return coveredHours(segments, false);
}

function coveredHours(segments: PumpSegment[], cellOnly: boolean): number | null {
  const covered = new Array<boolean>(1440).fill(false);
  for (const s of segments) {
    const a = minutes(s.start);
    const b = minutes(s.end);
    if (a === null || b === null) return null;
    if (cellOnly && !s.cell) continue;
    const end = b <= a ? b + 1440 : b; // equal start and end: the whole day
    for (let t = a; t < end; t += 1) covered[t % 1440] = true;
  }
  return Math.round((covered.filter(Boolean).length / 60) * 100) / 100;
}


export const MAX_RUNS = 24;

export type ScheduleResult = { ok: true; segments: PumpSegment[]; cellHours: number } | { ok: false; error: string };

/**
 * Rows from the schedule form: speed_unit, then start_i, end_i, speed_i, cell_i for
 * i = 0…23. Empty rows are skipped.
 */
export function scheduleFromForm(get: (name: string) => string | null): ScheduleResult {
  const given = get("speed_unit");
  const unit: SpeedUnit = isSpeedUnit(given) ? given : "rpm";
  const info = speedUnitInfo(unit);
  const segments: PumpSegment[] = [];
  for (let i = 0; i < MAX_RUNS; i += 1) {
    const start = (get(`start_${i}`) ?? "").trim();
    const end = (get(`end_${i}`) ?? "").trim();
    if (!start && !end) continue;
    if (!start || !end) return { ok: false, error: `Run ${i + 1} needs a start and an end time.` };
    const speedText = (get(`speed_${i}`) ?? "").trim().replace(",", ".");
    const speed = speedText ? Number(speedText) : null;
    if (speed !== null) {
      const ok = Number.isFinite(speed) && speed >= 0 && speed <= info.max && (!info.integer || Number.isInteger(speed));
      if (!ok) return { ok: false, error: `Run ${i + 1}: ${info.range}.` };
    }
    segments.push({ start, end, cell: get(`cell_${i}`) === "on", speed: speed === null ? null : Math.round(speed * 10) / 10, unit });
  }
  if (segments.length === 0) return { ok: false, error: "Add at least one run." };
  const cellHours = cellHoursPerDay(segments);
  if (cellHours === null) return { ok: false, error: "Times look like 08:00 or 18:30." };
  return { ok: true, segments, cellHours };
}
