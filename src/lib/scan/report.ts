/**
 * "Report a misread": what the scan read against what is in the form now, the report
 * the browser sends, and the checks the server runs on it. Pure and safe in client
 * components; storage and database work is in report-store.ts.
 */

import { methodLabel, READING_METHODS, type Units } from "@/lib/format";
import { isSpeedUnit, speedText, speedUnitInfo, type SpeedUnit } from "@/lib/pump";
import { SCAN_SOURCES } from "./map";

export type ReportKind = "test" | "pump";

/** Reports one person can send per UTC day. */
export const REPORT_DAILY_LIMIT = 10;
export const REPORT_NOTE_MAX = 500;
/** Largest shared photo the server takes. */
export const REPORT_PHOTO_MAX_BYTES = 2 * 1024 * 1024;
/** Long side of a shared photo, in pixels, after the crop on the device. */
export const REPORT_PHOTO_MAX_EDGE = 1600;
/** Months a shared photo is kept. */
export const REPORT_PHOTO_MONTHS = 12;
/**
 * The wording a person agreed to when sharing a photo (the help text under the box and
 * the privacy notice's "Reporting a misread"). Change it when either changes.
 */
export const REPORT_CONSENT_VERSION = "2026-10-04";

export const NO_CHANGES_TEXT = "Fix the wrong numbers in the form first, then send the report.";

/** One field the person changed after the scan. */
export interface ReportChange {
  /** Key in `corrected`. */
  key: string;
  /** "pH: read 7.8, now 7.4" */
  text: string;
  /** What is stored in `corrected` (database units: °C). Null: the field was cleared. */
  value: unknown;
}

// ---------------------------------------------------------------------------
// Water tests
// ---------------------------------------------------------------------------

/** The measures a test scan can fill, as the reading form names them. */
export const TEST_FIELDS = [
  { key: "fc", label: "Free chlorine", unit: "ppm" },
  { key: "cc", label: "Combined chlorine", unit: "ppm" },
  { key: "ph", label: "pH", unit: "" },
  { key: "ta", label: "Alkalinity", unit: "ppm" },
  { key: "cya", label: "Stabilizer", unit: "ppm" },
  { key: "salt", label: "Salt", unit: "ppm" },
  { key: "ch", label: "Calcium", unit: "ppm" },
  { key: "borate", label: "Borates", unit: "ppm" },
  { key: "phosphate", label: "Phosphates", unit: "ppb" },
] as const;

/** What a test scan returned, as kept in `read`. */
export interface TestRead {
  fields: Partial<Record<string, number>>;
  waterTempC: number | null;
  method: string | null;
  testDate?: string | null;
  confidence?: string | null;
  uncertain?: string[];
}

function parseNumber(raw: string | undefined): number | null {
  const trimmed = (raw ?? "").replace(/,/g, "").trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

function same(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return a === b;
  return Math.abs(a - b) < 1e-9;
}

function withUnit(value: number | null, unit: string, missing: string): string {
  if (value === null) return missing;
  return unit ? `${value} ${unit}` : String(value);
}

function line(label: string, read: string, now: string): string {
  return `${label}: read ${read}, now ${now}`;
}

const toF = (c: number) => Math.round((c * 9) / 5 + 32);
const toC = (f: number) => Math.round((((f - 32) * 5) / 9) * 10) / 10;

/**
 * The fields of a test the person changed after the scan filled the form. `values` are
 * the form's strings (water temperature in the person's units); fields not changed are
 * left out.
 */
export function testChanges(read: TestRead, values: Record<string, string | undefined>, units: Units): ReportChange[] {
  const changes: ReportChange[] = [];
  for (const field of TEST_FIELDS) {
    const before = typeof read.fields[field.key] === "number" ? (read.fields[field.key] as number) : null;
    const now = parseNumber(values[field.key]);
    if (same(before, now)) continue;
    changes.push({
      key: field.key,
      text: line(field.label, withUnit(before, field.unit, "nothing"), withUnit(now, field.unit, "blank")),
      value: now,
    });
  }

  // Water temperature: the form shows it in the person's units, rounded as the scan filled it.
  const tempUnit = units === "us" ? "°F" : "°C";
  const shown = (c: number | null) => (c === null ? null : units === "us" ? toF(c) : Math.round(c));
  const tempBefore = shown(read.waterTempC);
  const tempNow = parseNumber(values.water_temp);
  if (!same(tempBefore, tempNow)) {
    changes.push({
      key: "water_temp_c",
      text: line("Water temp", withUnit(tempBefore, tempUnit, "nothing"), withUnit(tempNow, tempUnit, "blank")),
      value: tempNow === null ? null : units === "us" ? toC(tempNow) : tempNow,
    });
  }

  const methodNow = values.method?.trim() || null;
  if (read.method && methodNow && methodNow !== read.method) {
    changes.push({ key: "method", text: line("Tested with", methodLabel(read.method), methodLabel(methodNow)), value: methodNow });
  }
  return changes;
}

// ---------------------------------------------------------------------------
// Pump schedules
// ---------------------------------------------------------------------------

export interface PumpRun {
  start: string;
  end: string;
  speed: number | null;
  cell: boolean;
}

/** What a pump scan put in the form, as kept in `read`. */
export interface PumpRead {
  rows: PumpRun[];
  unit: SpeedUnit;
  confidence?: string | null;
}

/** "08:00–16:00, 2400 RPM, cell on" */
export function runText(run: PumpRun, unit: SpeedUnit): string {
  const parts = [`${run.start}–${run.end}`];
  if (run.speed !== null) parts.push(speedText(run.speed, unit));
  parts.push(run.cell ? "cell on" : "cell off");
  return parts.join(", ");
}

function sameRun(a: PumpRun | undefined, b: PumpRun | undefined): boolean {
  if (!a || !b) return a === b;
  return a.start === b.start && a.end === b.end && same(a.speed, b.speed) && a.cell === b.cell;
}

/** The form's runs, as strings, to runs: blank times are left out, a bad speed is none. */
export function pumpRuns(rows: { start: string; end: string; speed: string; cell: boolean }[]): PumpRun[] {
  return rows
    .filter((r) => r.start && r.end)
    .map((r) => ({ start: r.start, end: r.end, speed: parseNumber(r.speed), cell: r.cell }));
}

/** The runs (and the unit) the person changed after the scan, run by run. */
export function pumpChanges(read: PumpRead, now: { rows: PumpRun[]; unit: SpeedUnit }): ReportChange[] {
  const changes: ReportChange[] = [];
  if (now.unit !== read.unit) {
    changes.push({
      key: "unit",
      text: line("Set by", speedUnitInfo(read.unit).label, speedUnitInfo(now.unit).label),
      value: now.unit,
    });
  }
  const count = Math.max(read.rows.length, now.rows.length);
  for (let i = 0; i < count; i++) {
    const before = read.rows[i];
    const after = now.rows[i];
    // A unit change alone is its own line above.
    if (sameRun(before, after)) continue;
    changes.push({
      key: `run_${i + 1}`,
      text: line(`Run ${i + 1}`, before ? runText(before, read.unit) : "nothing", after ? runText(after, now.unit) : "removed"),
      value: after ?? null,
    });
  }
  return changes;
}

// ---------------------------------------------------------------------------
// The report the browser sends, checked on the server
// ---------------------------------------------------------------------------

export interface ReportPayload {
  kind: ReportKind;
  source: string;
  read: Record<string, unknown>;
  corrected: Record<string, unknown>;
  note: string | null;
  photoConsent: boolean;
}

export type ParsedReport = { ok: true; report: ReportPayload } | { ok: false; error: string };

/** Largest `read` or `corrected` the server stores, as JSON. */
const JSON_MAX = 16_000;

const TEST_KEYS = new Set<string>([...TEST_FIELDS.map((f) => f.key), "water_temp_c", "method"]);
const TIME = /^([01]\d|2[0-4]):[0-5]\d$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validTestValue(key: string, value: unknown): boolean {
  if (key === "method") return typeof value === "string" && READING_METHODS.some((m) => m.value === value);
  return value === null || (typeof value === "number" && Number.isFinite(value) && Math.abs(value) < 100_000);
}

function validRun(value: unknown): boolean {
  if (value === null) return true;
  if (!isRecord(value)) return false;
  const { start, end, speed, cell } = value;
  return (
    typeof start === "string" &&
    TIME.test(start) &&
    typeof end === "string" &&
    TIME.test(end) &&
    (speed === null || (typeof speed === "number" && Number.isFinite(speed) && speed >= 0 && speed <= 10_000)) &&
    typeof cell === "boolean"
  );
}

function validCorrected(kind: ReportKind, corrected: Record<string, unknown>): boolean {
  const entries = Object.entries(corrected);
  if (entries.length > 30) return false;
  if (kind === "test") return entries.every(([k, v]) => TEST_KEYS.has(k) && validTestValue(k, v));
  return entries.every(([k, v]) => (k === "unit" ? isSpeedUnit(v) : /^run_([1-9]|1\d|2[0-4])$/.test(k) && validRun(v)));
}

/** Checks the JSON part of a report; the photo is checked separately. */
export function parseReport(raw: unknown): ParsedReport {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return { ok: false, error: "The report could not be read." };
    }
  }
  if (!isRecord(value)) return { ok: false, error: "The report could not be read." };
  const kind = value.kind;
  if (kind !== "test" && kind !== "pump") return { ok: false, error: "Unknown kind of scan." };
  if (!isRecord(value.read) || !isRecord(value.corrected)) return { ok: false, error: "The report could not be read." };
  if (JSON.stringify(value.read).length > JSON_MAX || JSON.stringify(value.corrected).length > JSON_MAX) {
    return { ok: false, error: "The report is too long." };
  }
  if (Object.keys(value.corrected).length === 0) return { ok: false, error: NO_CHANGES_TEXT };
  if (!validCorrected(kind, value.corrected)) return { ok: false, error: "The corrected values could not be read." };
  const note = typeof value.note === "string" ? value.note.trim() : "";
  if (note.length > REPORT_NOTE_MAX) return { ok: false, error: `Keep the note to ${REPORT_NOTE_MAX} characters.` };
  const source =
    kind === "pump" ? "pump_schedule" : (SCAN_SOURCES.find((s) => s === value.source) ?? "unknown");
  return {
    ok: true,
    report: {
      kind,
      source,
      read: value.read,
      corrected: value.corrected,
      note: note || null,
      photoConsent: value.photoConsent === true,
    },
  };
}

/** A JPEG starts with FF D8 FF, whatever the file name or type says. */
export function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

/** Where a shared photo lives in the "scan-reports" bucket. */
export function reportPhotoPath(userId: string, reportId: string): string {
  return `${userId}/${reportId}.jpg`;
}

/** The day a photo shared at `at` is deleted (YYYY-MM-DD, UTC): 12 months on, clamped to the month's end. */
export function photoDeleteAfter(at: Date): string {
  const year = at.getUTCFullYear();
  const month = at.getUTCMonth() + REPORT_PHOTO_MONTHS;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(at.getUTCDate(), lastDay))).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Reading a stored report back (admin page)
// ---------------------------------------------------------------------------

export interface ReportLine {
  label: string;
  read: string;
  corrected: string;
}

function readTest(read: Record<string, unknown>): TestRead {
  const fields = isRecord(read.fields) ? read.fields : {};
  return {
    fields: Object.fromEntries(Object.entries(fields).filter(([, v]) => typeof v === "number")) as Record<string, number>,
    waterTempC: typeof read.waterTempC === "number" ? read.waterTempC : null,
    method: typeof read.method === "string" ? read.method : null,
  };
}

function readPump(read: Record<string, unknown>): PumpRead {
  const rows = Array.isArray(read.rows) ? read.rows.filter((r): r is PumpRun => validRun(r) && r !== null) : [];
  return { rows, unit: isSpeedUnit(read.unit) ? read.unit : "rpm" };
}

/** "pH: 7.8 → 7.4" for each corrected field, in database units (°C). */
export function reportLines(kind: ReportKind, read: unknown, corrected: unknown): ReportLine[] {
  const r = isRecord(read) ? read : {};
  const c = isRecord(corrected) ? corrected : {};
  const lines: ReportLine[] = [];
  if (kind === "test") {
    const t = readTest(r);
    for (const [key, value] of Object.entries(c)) {
      const field = TEST_FIELDS.find((f) => f.key === key);
      if (field) {
        lines.push({
          label: field.label,
          read: withUnit(t.fields[key] ?? null, field.unit, "nothing"),
          corrected: withUnit(typeof value === "number" ? value : null, field.unit, "blank"),
        });
      } else if (key === "water_temp_c") {
        lines.push({
          label: "Water temp",
          read: withUnit(t.waterTempC, "°C", "nothing"),
          corrected: withUnit(typeof value === "number" ? value : null, "°C", "blank"),
        });
      } else if (key === "method") {
        lines.push({ label: "Tested with", read: t.method ? methodLabel(t.method) : "nothing", corrected: methodLabel(String(value)) });
      }
    }
    return lines;
  }
  const p = readPump(r);
  const unit = isSpeedUnit(c.unit) ? c.unit : p.unit;
  for (const [key, value] of Object.entries(c)) {
    if (key === "unit") {
      lines.push({ label: "Set by", read: speedUnitInfo(p.unit).label, corrected: speedUnitInfo(unit).label });
      continue;
    }
    const index = Number(key.replace("run_", "")) - 1;
    const before = p.rows[index];
    lines.push({
      label: `Run ${index + 1}`,
      read: before ? runText(before, p.unit) : "nothing",
      corrected: validRun(value) && value !== null ? runText(value as PumpRun, unit) : "removed",
    });
  }
  return lines;
}

/** A fresh scan's result in the shape of `read`, for "Read again" on the admin page. */
export function testReadOf(result: { fields: Partial<Record<string, number>>; waterTempC: number | null; method: string; confidence?: string }): TestRead {
  return { fields: result.fields, waterTempC: result.waterTempC, method: result.method, confidence: result.confidence ?? null };
}
