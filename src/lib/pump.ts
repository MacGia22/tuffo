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

/** Variable-speed pumps are set by speed (RPM) or by flow (gallons per minute). */
export type SpeedUnit = "rpm" | "gpm";

/** Below these, many salt cells see too little flow and stay off; only a first guess. */
export const LOW_RPM = 1500;
export const LOW_GPM = 20;

export function cellLikelyOn(speed: number | null, unit: SpeedUnit): boolean {
  if (speed === null) return true;
  return unit === "gpm" ? speed >= LOW_GPM : speed >= LOW_RPM;
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
  const unit: SpeedUnit = get("speed_unit") === "gpm" ? "gpm" : "rpm";
  const segments: PumpSegment[] = [];
  for (let i = 0; i < MAX_RUNS; i += 1) {
    const start = (get(`start_${i}`) ?? "").trim();
    const end = (get(`end_${i}`) ?? "").trim();
    if (!start && !end) continue;
    if (!start || !end) return { ok: false, error: `Run ${i + 1} needs a start and an end time.` };
    const speedText = (get(`speed_${i}`) ?? "").trim().replace(",", ".");
    const speed = speedText ? Number(speedText) : null;
    if (speed !== null) {
      const ok =
        unit === "rpm"
          ? Number.isInteger(speed) && speed >= 0 && speed <= 5000
          : Number.isFinite(speed) && speed >= 0 && speed <= 200;
      if (!ok) return { ok: false, error: `Run ${i + 1}: ${unit === "rpm" ? "speed is 0 to 5,000 RPM" : "flow is 0 to 200 GPM"}.` };
    }
    segments.push({ start, end, cell: get(`cell_${i}`) === "on", speed: speed === null ? null : Math.round(speed * 10) / 10, unit });
  }
  if (segments.length === 0) return { ok: false, error: "Add at least one run." };
  const cellHours = cellHoursPerDay(segments);
  if (cellHours === null) return { ok: false, error: "Times look like 08:00 or 18:30." };
  return { ok: true, segments, cellHours };
}
