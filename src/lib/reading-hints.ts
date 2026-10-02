/**
 * Help on the Log a test form: the last value of each measure ("last: 8.0 on Sep 26")
 * and gentle checks for numbers that look mistyped ("pH 75? Did you mean 7.5?").
 * Pure; browser-safe. Values are as typed in the form's units.
 */

import type { Units } from "@/lib/format";

export const HINT_FIELDS = ["fc", "cc", "ph", "ta", "ch", "cya", "salt", "borate", "phosphate", "water_temp"] as const;
export type HintField = (typeof HINT_FIELDS)[number];

export interface PastReading {
  taken_at: string;
  method: string | null;
  fc: number | string | null;
  cc: number | string | null;
  ph: number | string | null;
  ta: number | string | null;
  ch: number | string | null;
  cya: number | string | null;
  salt: number | string | null;
  borate: number | string | null;
  phosphate: number | string | null;
  water_temp_c: number | string | null;
}

function shortDate(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone });
}

function show(field: HintField, value: number): string {
  if (field === "fc" || field === "cc") return value.toFixed(1);
  if (field === "ph") return value.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 2 });
  return String(Math.round(value));
}

/**
 * The most recent value of each measure across past tests (newest first), as
 * "8.0 on Sep 26", with temperature in the person's units; and the last method used.
 */
export function lastValues(
  readings: PastReading[],
  units: Units,
  timeZone: string,
): { values: Partial<Record<HintField, string>>; method: string | null } {
  const values: Partial<Record<HintField, string>> = {};
  for (const r of readings) {
    for (const field of HINT_FIELDS) {
      if (values[field]) continue;
      const raw = field === "water_temp" ? r.water_temp_c : r[field];
      if (raw === null || raw === undefined || raw === "") continue;
      let value = Number(raw);
      if (!Number.isFinite(value)) continue;
      if (field === "water_temp" && units === "us") value = (value * 9) / 5 + 32;
      values[field] = `${show(field, value)}${field === "water_temp" ? (units === "us" ? " °F" : " °C") : ""} on ${shortDate(r.taken_at, timeZone)}`;
    }
  }
  const method = readings.find((r) => r.method && r.method !== "imported")?.method ?? null;
  return { values, method };
}

interface Plausible {
  label: string;
  low: number;
  high: number;
  unit: string;
}

const PLAUSIBLE: Record<Exclude<HintField, "water_temp">, Plausible> = {
  // Shock (SLAM) level is 40% of CYA: up to 40 ppm at CYA 100.
  fc: { label: "FC", low: 0, high: 40, unit: "ppm" },
  cc: { label: "CC", low: 0, high: 5, unit: "ppm" },
  ph: { label: "pH", low: 6.2, high: 8.6, unit: "" },
  ta: { label: "TA", low: 0, high: 250, unit: "ppm" },
  ch: { label: "CH", low: 0, high: 1000, unit: "ppm" },
  cya: { label: "CYA", low: 0, high: 150, unit: "ppm" },
  salt: { label: "Salt", low: 0, high: 7000, unit: "ppm" },
  borate: { label: "Borates", low: 0, high: 100, unit: "ppm" },
  phosphate: { label: "Phosphates", low: 0, high: 5000, unit: "ppb" },
};

const fmt = (n: number) => String(Math.round(n * 100) / 100);

/**
 * A gentle note for a number outside what pools usually read, suggesting the likely
 * typo when moving the decimal point fixes it. Null when it looks fine or is empty.
 */
export function rangeHint(field: HintField, typed: string, units: Units): string | null {
  if (typed.trim() === "") return null;
  const value = Number(typed);
  if (!Number.isFinite(value)) return null;
  const p: Plausible =
    field === "water_temp"
      ? units === "us"
        ? { label: "Water", low: 33, high: 110, unit: "°F" }
        : { label: "Water", low: 1, high: 43, unit: "°C" }
      : PLAUSIBLE[field];
  if (value >= p.low && value <= p.high) return null;
  const name = `${p.label} ${fmt(value)}${p.unit && field !== "water_temp" ? "" : p.unit ? ` ${p.unit}` : ""}`;
  for (const factor of [10, 100]) {
    const fixed = value / factor;
    if (value > p.high && fixed >= p.low && fixed <= p.high && (field !== "ph" || fixed >= 6.2)) {
      return `${name}? Did you mean ${field === "ph" ? show("ph", fixed) : fmt(fixed)}?`;
    }
  }
  const range = `${fmt(p.low)}–${fmt(p.high)}${p.unit ? ` ${p.unit}` : ""}`;
  return `${name} is unusual; most pools read ${range}. Check the number.`;
}
