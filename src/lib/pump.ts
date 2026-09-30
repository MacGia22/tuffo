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
  /** Pump speed, for the person's reference only. */
  rpm?: number | null;
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
  const covered = new Array<boolean>(1440).fill(false);
  for (const s of segments) {
    const a = minutes(s.start);
    const b = minutes(s.end);
    if (a === null || b === null) return null;
    if (!s.cell) continue;
    const end = b <= a ? b + 1440 : b; // equal start and end: the whole day
    for (let t = a; t < end; t += 1) covered[t % 1440] = true;
  }
  return Math.round((covered.filter(Boolean).length / 60) * 100) / 100;
}


export const MAX_RUNS = 24;

export type ScheduleResult = { ok: true; segments: PumpSegment[]; cellHours: number } | { ok: false; error: string };

/** Rows from the schedule form: start_i, end_i, rpm_i, cell_i for i = 0…23. Empty rows are skipped. */
export function scheduleFromForm(get: (name: string) => string | null): ScheduleResult {
  const segments: PumpSegment[] = [];
  for (let i = 0; i < MAX_RUNS; i += 1) {
    const start = (get(`start_${i}`) ?? "").trim();
    const end = (get(`end_${i}`) ?? "").trim();
    if (!start && !end) continue;
    if (!start || !end) return { ok: false, error: `Run ${i + 1} needs a start and an end time.` };
    const rpmText = (get(`rpm_${i}`) ?? "").trim();
    const rpm = rpmText ? Number(rpmText) : null;
    if (rpm !== null && (!Number.isInteger(rpm) || rpm < 0 || rpm > 5000)) return { ok: false, error: `Run ${i + 1}: speed is 0 to 5,000 RPM.` };
    segments.push({ start, end, cell: get(`cell_${i}`) === "on", rpm });
  }
  if (segments.length === 0) return { ok: false, error: "Add at least one run." };
  const cellHours = cellHoursPerDay(segments);
  if (cellHours === null) return { ok: false, error: "Times look like 08:00 or 18:30." };
  return { ok: true, segments, cellHours };
}
