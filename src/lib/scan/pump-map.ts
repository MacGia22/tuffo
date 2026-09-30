/**
 * Turns the vision model's reading of a pump-schedule screen into schedule rows.
 * Pure, so it is unit-tested without the API.
 */

export interface PumpScanOutput {
  runs?: Array<{ start?: unknown; end?: unknown; rpm?: unknown; speed_label?: unknown }>;
  confidence?: string;
  notes?: string;
}

export interface PumpRow {
  start: string;
  end: string;
  rpm: number | null;
  /** Guess: the cell runs unless the speed is too low for its flow switch (under 1,500 RPM). */
  cell: boolean;
}

export interface PumpScanResult {
  rows: PumpRow[];
  confidence: "high" | "medium" | "low";
  notes: string | null;
}

/** Below this speed many salt cells see too little flow and stay off. */
export const LOW_SPEED_RPM = 1500;

/** "8:00", "08:00", "8:00 PM", "20:00" → "HH:MM" (24 h), or null. */
export function normalizeTime(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = value.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])?\.?m?\.?$/i);
  if (!m) return null;
  let h = Number(m[1]);
  const mi = Number(m[2] ?? 0);
  const ampm = m[3]?.toLowerCase();
  if (ampm) {
    if (h < 1 || h > 12) return null;
    if (ampm === "p" && h !== 12) h += 12;
    if (ampm === "a" && h === 12) h = 0;
  }
  if (h > 24 || mi > 59 || (h === 24 && mi > 0)) return null;
  if (h === 24) h = 0;
  return `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
}

export function mapPumpScan(output: PumpScanOutput): PumpScanResult {
  const rows: PumpRow[] = [];
  for (const run of output.runs ?? []) {
    const start = normalizeTime(run.start);
    const end = normalizeTime(run.end);
    if (!start || !end) continue;
    const rpm = typeof run.rpm === "number" && Number.isFinite(run.rpm) && run.rpm > 0 ? Math.round(run.rpm) : null;
    rows.push({ start, end, rpm, cell: rpm === null || rpm >= LOW_SPEED_RPM });
    if (rows.length >= 24) break;
  }
  const confidence = output.confidence === "high" || output.confidence === "medium" ? output.confidence : "low";
  const notes = typeof output.notes === "string" && output.notes.trim() ? output.notes.trim().slice(0, 300) : null;
  return { rows, confidence, notes };
}
