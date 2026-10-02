import { baseToShelf, shelfToBase, type BaseUnit } from "@/lib/dose-format";
import { CM_PER_INCH, eventKindInfo } from "@/lib/events";
import type { Units } from "@/lib/format";
import { localInZone } from "@/lib/form-data";

/**
 * A saved test, dose or event as its edit form shows it: strings, in the person's
 * units, with the time on the pool's clock. Saving unchanged values stores the same
 * numbers back (to within 0.1% for a dose amount).
 */

const READING_FIELDS = ["fc", "cc", "ph", "ta", "ch", "cya", "salt", "borate", "phosphate"] as const;

export interface EditableReading {
  taken_at: string;
  water_temp_c: number | string | null;
  method: string;
  notes: string | null;
  [key: string]: number | string | null;
}

function num(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : "";
}

function round(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

/**
 * A stored temperature (°C to 0.1) in °F as the field shows it: whole degrees when they
 * save back to the same °C (83 °F is stored as 28.3 °C, which would read back as 82.9 °F),
 * otherwise to 0.1 °F, which always does.
 */
function fahrenheitField(celsius: number): number {
  const whole = Math.round((celsius * 9) / 5 + 32);
  return round(((whole - 32) * 5) / 9, 1) === celsius ? whole : round((celsius * 9) / 5 + 32, 1);
}

export function readingEditValues(r: EditableReading, units: Units, timeZone: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const key of READING_FIELDS) values[key] = num(r[key]);
  if (r.water_temp_c !== null && r.water_temp_c !== "") {
    const c = round(Number(r.water_temp_c), 1);
    values.water_temp = String(units === "us" ? fahrenheitField(c) : c);
  } else {
    values.water_temp = "";
  }
  values.method = r.method;
  values.taken_at = localInZone(r.taken_at, timeZone);
  values.notes = r.notes ?? "";
  return values;
}

export function doseEditValues(
  d: { product_id: string; amount: number | string; unit: BaseUnit; added_at: string; notes: string | null },
  units: Units,
  timeZone: string,
): Record<string, string> {
  const amount = Number(d.amount);
  // The shelf unit the list shows, with the exact amount in it rather than the rounded one.
  const shelf = baseToShelf(amount, d.unit, units).unit;
  const perUnit = shelfToBase(1, shelf).amount;
  return {
    product: d.product_id,
    amount: String(round(amount / perUnit, 3)),
    unit: shelf,
    added_at: localInZone(d.added_at, timeZone),
    notes: d.notes ?? "",
  };
}

export function eventEditValues(
  e: { kind: string; value: number | string | null; occurred_at: string; notes: string | null },
  units: Units,
  timeZone: string,
): Record<string, string> {
  let value = "";
  if (e.value !== null && e.value !== "") {
    const v = Number(e.value);
    value = eventKindInfo(e.kind)?.value === "depth" && units === "us" ? String(round(v / CM_PER_INCH, 2)) : String(v);
  }
  return { kind: e.kind, value, occurred_at: localInZone(e.occurred_at, timeZone), notes: e.notes ?? "" };
}
