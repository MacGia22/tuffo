import { instantInZone } from "@/lib/form-data";
import type { CsvTable } from "./csv";
import { parseImportDate, type DateOrder } from "./dates";

/**
 * Turns a CSV of water tests (a Pool Math export or any sheet with a date column) into
 * rows for the readings table: map columns, parse dates in the pool's time zone and
 * numbers with their units, check ranges, and drop duplicates (the same minute as
 * another row in the file or a test already logged). Pure; the server and the preview
 * run the same code.
 */

export const MAX_IMPORT_ROWS = 5000;
export const MAX_IMPORT_BYTES = 1_000_000;

export const IMPORT_FIELDS = [
  { key: "when", label: "Date and time", required: true },
  { key: "fc", label: "Free chlorine (ppm)" },
  { key: "cc", label: "Combined chlorine (ppm)" },
  { key: "ph", label: "pH" },
  { key: "ta", label: "Alkalinity (ppm)" },
  { key: "ch", label: "Calcium (ppm)" },
  { key: "cya", label: "Stabilizer (ppm)" },
  { key: "salt", label: "Salt (ppm)" },
  { key: "borate", label: "Borates (ppm)" },
  { key: "water_temp", label: "Water temperature" },
  { key: "notes", label: "Notes" },
  { key: "backwashed", label: "Backwashed (True/False)" },
  { key: "filter_cleaned", label: "Cleaned filter (True/False)" },
  { key: "vacuumed", label: "Vacuumed (True/False)" },
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number]["key"];
export type Mapping = Partial<Record<ImportField, number>>;
export type NumberField = "fc" | "cc" | "ph" | "ta" | "ch" | "cya" | "salt" | "borate";

export const NUMBER_FIELDS: NumberField[] = ["fc", "cc", "ph", "ta", "ch", "cya", "salt", "borate"];

/** Upkeep a row says was done that day (Pool Math's Backwashed, Cleaned Filter, Vacuumed). */
export type UpkeepKind = "backwash" | "filter_clean" | "vacuum";

const UPKEEP_FIELDS: { field: ImportField; kind: UpkeepKind }[] = [
  { field: "backwashed", kind: "backwash" },
  { field: "filter_cleaned", kind: "filter_clean" },
  { field: "vacuumed", kind: "vacuum" },
];

/** The same limits as the log form. */
const RANGES: Record<NumberField, { min: number; max: number; label: string }> = {
  fc: { min: 0, max: 100, label: "Free chlorine" },
  cc: { min: 0, max: 50, label: "Combined chlorine" },
  ph: { min: 5, max: 10, label: "pH" },
  ta: { min: 0, max: 1000, label: "Alkalinity" },
  ch: { min: 0, max: 3000, label: "Calcium" },
  cya: { min: 0, max: 500, label: "Stabilizer" },
  salt: { min: 0, max: 20000, label: "Salt" },
  borate: { min: 0, max: 200, label: "Borates" },
};

/**
 * Header names, lower-cased with punctuation and units removed. Pool Math's "Test Logs"
 * export has Date, FC, pH, TA, CH, CYA, Salt, Temp, CSI, Backwashed, Cleaned Filter,
 * Vacuumed and Notes (see __tests__/fixtures/poolmath-export.csv); its share API also
 * names cc, bor and waterTemp. Unknown columns (TDS, CSI, flow rate, pressure, SWG %)
 * are left out.
 */
const ALIASES: Record<ImportField, string[]> = {
  when: ["timestamp", "date", "datetime", "date time", "logged", "logged at", "test date", "date tested", "when", "time"],
  fc: ["fc", "free chlorine", "free cl", "chlorine", "fc ppm"],
  cc: ["cc", "combined chlorine", "cc ppm"],
  ph: ["ph"],
  ta: ["ta", "total alkalinity", "alkalinity", "ta ppm"],
  ch: ["ch", "calcium hardness", "calcium", "hardness", "ch ppm"],
  cya: ["cya", "stabilizer", "cyanuric acid", "stabiliser", "cya ppm"],
  salt: ["salt", "salt ppm", "nacl"],
  borate: ["borates", "borate", "bor", "borates ppm"],
  water_temp: ["watertemp", "water temp", "water temperature", "temp", "temperature", "temp f", "temp c"],
  notes: ["notes", "note", "comment", "comments"],
  backwashed: ["backwashed", "backwash"],
  filter_cleaned: ["cleaned filter", "filter cleaned", "clean filter", "filter clean"],
  vacuumed: ["vacuumed", "vacuum"],
};

function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, " ")
    .replace(/°/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Best guess at which column holds what; each column is used at most once. */
export function guessMapping(headers: string[]): Mapping {
  const normalized = headers.map(normalizeHeader);
  const used = new Set<number>();
  const mapping: Mapping = {};
  for (const { key } of IMPORT_FIELDS) {
    for (const alias of ALIASES[key]) {
      const index = normalized.findIndex((h, i) => h === alias && !used.has(i));
      if (index >= 0) {
        mapping[key] = index;
        used.add(index);
        break;
      }
    }
  }
  return mapping;
}

/** Temperature unit from a header like "Temp (°F)", or null when it does not say. */
export function guessTempUnit(header: string | undefined): "F" | "C" | null {
  if (!header) return null;
  if (/°\s*f|\(f\)|\bf\b|fahrenheit/i.test(header)) return "F";
  if (/°\s*c|\(c\)|\bc\b|celsius/i.test(header)) return "C";
  return null;
}

/** "3.5", "3,5", "80 ppm", "7.4 pH" → number; "", "-", "n/a" → null; anything else → NaN. */
export function parseImportNumber(raw: string | undefined): number | null {
  const value = (raw ?? "").trim().toLowerCase();
  if (value === "" || value === "-" || value === "—" || value === "n/a" || value === "na" || value === "null") return null;
  const cleaned = value.replace(/\s*(ppm|ppb|ph|°f|°c|f|c)$/, "").replace(/^(\d+),(\d+)$/, "$1.$2").replace(/,/g, "");
  const n = Number(cleaned);
  return cleaned !== "" && Number.isFinite(n) ? n : Number.NaN;
}

/** "True", "yes", "1", "x" → true; anything else (blank, "False") → false. */
export function parseImportFlag(raw: string | undefined): boolean {
  return /^(true|t|yes|y|1|x|✓)$/i.test((raw ?? "").trim());
}

export interface ImportOptions {
  mapping: Mapping;
  dateOrder: DateOrder;
  tempUnit: "F" | "C";
  timeZone: string;
  now?: number;
}

export interface ImportRow {
  /** Line in the file, counting the header as line 1. */
  line: number;
  taken_at: string;
  values: Partial<Record<NumberField, number>>;
  water_temp_c: number | null;
  notes: string | null;
  /** Upkeep the row marks as done, in UPKEEP_FIELDS order. */
  upkeep: UpkeepKind[];
}

export interface ImportProblem {
  line: number;
  reason: string;
}

export interface ImportPlan {
  rows: ImportRow[];
  problems: ImportProblem[];
  /** Rows dropped for sharing a minute with an earlier row in the same file. */
  duplicatesInFile: number;
  /** Rows beyond MAX_IMPORT_ROWS, not read. */
  overLimit: number;
}

/** The minute a test was taken, as a dedupe key: "2026-09-27T12:30". */
export function minuteKey(iso: string): string {
  return new Date(Date.parse(iso)).toISOString().slice(0, 16);
}

export function planImport(table: CsvTable, options: ImportOptions): ImportPlan {
  const { mapping } = options;
  const problems: ImportProblem[] = [];
  const rows: ImportRow[] = [];
  const seen = new Set<string>();
  let duplicatesInFile = 0;
  const overLimit = Math.max(0, table.rows.length - MAX_IMPORT_ROWS);

  if (mapping.when === undefined) {
    return { rows, problems: [{ line: 1, reason: "Choose the column with the date." }], duplicatesInFile, overLimit };
  }

  table.rows.slice(0, MAX_IMPORT_ROWS).forEach((cells, i) => {
    const line = table.lines?.[i] ?? i + 2;
    const cell = (field: ImportField) => (mapping[field] === undefined ? undefined : cells[mapping[field]!]);

    const rawWhen = cell("when") ?? "";
    const parsed = parseImportDate(rawWhen, options.dateOrder);
    if (!parsed) {
      problems.push({ line, reason: rawWhen ? `"${rawWhen.slice(0, 40)}" is not a date Tuffo can read.` : "No date." });
      return;
    }
    let takenAt: string;
    if ("instant" in parsed) {
      takenAt = parsed.instant;
      if (Date.parse(takenAt) > (options.now ?? Date.now()) + 3_600_000) {
        problems.push({ line, reason: "That time is in the future." });
        return;
      }
    } else {
      const result = instantInZone(parsed.wall, options.timeZone, options.now);
      if (!result.ok || !result.iso) {
        problems.push({ line, reason: result.ok ? "No date." : result.error });
        return;
      }
      takenAt = result.iso;
    }

    const values: Partial<Record<NumberField, number>> = {};
    let bad: string | null = null;
    for (const field of NUMBER_FIELDS) {
      const n = parseImportNumber(cell(field));
      if (n === null) continue;
      const range = RANGES[field];
      if (Number.isNaN(n)) bad ??= `${range.label} "${cell(field)}" is not a number.`;
      else if (n < range.min || n > range.max) bad ??= `${range.label} ${n} is outside the range a test can report.`;
      else values[field] = n;
    }

    let waterTempC: number | null = null;
    const temp = parseImportNumber(cell("water_temp"));
    if (temp !== null) {
      const c = options.tempUnit === "F" ? ((temp - 32) * 5) / 9 : temp;
      if (Number.isNaN(temp) || c < -5 || c > 60) bad ??= `Water temperature "${cell("water_temp")}" does not look right.`;
      else waterTempC = Math.round(c * 10) / 10;
    }
    if (bad) {
      problems.push({ line, reason: bad });
      return;
    }
    if (Object.keys(values).length === 0) {
      problems.push({ line, reason: "No test results in this row." });
      return;
    }

    const key = minuteKey(takenAt);
    if (seen.has(key)) {
      duplicatesInFile += 1;
      return;
    }
    seen.add(key);

    const notes = (cell("notes") ?? "").slice(0, 2000) || null;
    const upkeep = UPKEEP_FIELDS.filter(({ field }) => parseImportFlag(cell(field))).map(({ kind }) => kind);
    rows.push({ line, taken_at: takenAt, values, water_temp_c: waterTempC, notes, upkeep });
  });

  return { rows, problems, duplicatesInFile, overLimit };
}
