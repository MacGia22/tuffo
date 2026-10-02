/**
 * Turns the vision model's reading of a pump-schedule screen into schedule rows.
 * Pure, so it is unit-tested without the API.
 */

import { cellLikelyOn, type SpeedUnit } from "@/lib/pump";

export interface PumpScanOutput {
  runs?: Array<{ start?: unknown; end?: unknown; speed?: unknown; speed_unit?: unknown; speed_label?: unknown }>;
  skipped?: unknown;
  cut_off?: unknown;
  confidence?: string;
  notes?: string;
}

export interface PumpRow {
  start: string;
  end: string;
  speed: number | null;
  unit: SpeedUnit;
  /** Guess: the cell runs unless speed or flow is too low for its flow switch. */
  cell: boolean;
}

export interface PumpScanResult {
  rows: PumpRow[];
  /** The unit the schedule is set in (one per schedule). */
  unit: SpeedUnit;
  /** The list continued past the image; another screenshot adds to it. */
  cutOff: boolean;
  confidence: "high" | "medium" | "low";
  notes: string | null;
}

/** "8:00", "08:00", "8:00 PM", "20:00", "20:00:00" → "HH:MM" (24 h), or null. */
export function normalizeTime(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = value.trim().match(/^(\d{1,2})(?::(\d{2})(?::[0-5]\d)?)?\s*([ap])?\.?m?\.?$/i);
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
  const runs = output.runs ?? [];
  // One unit per schedule: flow if any run is in GPM, else speed.
  const unit: SpeedUnit = runs.some((r) => r.speed_unit === "gpm") ? "gpm" : "rpm";
  const rows: PumpRow[] = [];
  for (const run of runs) {
    const start = normalizeTime(run.start);
    const end = normalizeTime(run.end);
    if (!start || !end) continue;
    const sameUnit = (run.speed_unit ?? unit) === unit;
    const raw = typeof run.speed === "number" && Number.isFinite(run.speed) && run.speed > 0 && sameUnit ? run.speed : null;
    const speed = raw === null ? null : unit === "rpm" ? Math.round(raw) : Math.round(raw * 10) / 10;
    rows.push({ start, end, speed, unit, cell: cellLikelyOn(speed, unit) });
    if (rows.length >= 24) break;
  }
  const confidence = output.confidence === "high" || output.confidence === "medium" ? output.confidence : "low";
  const said: string[] = [];
  const skipped = Array.isArray(output.skipped) ? output.skipped.filter((s): s is string => typeof s === "string" && s.trim() !== "") : [];
  if (skipped.length) said.push(`Left out ${skipped.slice(0, 5).join(", ")}: not on the daily schedule.`);
  if (output.cut_off === true) said.push("The list goes on past the screenshot: scroll and read the next screenshot too; its runs are added.");
  if (typeof output.notes === "string" && output.notes.trim()) said.push(output.notes.trim());
  const notes = said.length ? said.join(" ").slice(0, 400) : null;
  return { rows, unit, confidence, notes, cutOff: output.cut_off === true };
}
