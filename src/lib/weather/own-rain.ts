import type { SupabaseClient } from "@supabase/supabase-js";
import type { Units } from "@/lib/format";

/**
 * Rain at the pool: an owner's own figure for a day (a gauge, or a guess) replaces the
 * weather cell's. Storms can drop very different amounts a mile apart; the cell's rain
 * is a model estimate for a few kilometers around.
 */

export const OWN_RAIN_MAX_MM = 500;
const MM_PER_INCH = 25.4;

export interface OwnRain {
  date: string; // YYYY-MM-DD, local to the pool
  rain_mm: number;
}

/** Weather rows with the owner's rain in place of the cell's, and which days were replaced. */
export function withOwnRain<T extends { date: string; precipitation_mm: number | null }>(
  rows: T[],
  own: OwnRain[],
): Array<T & { ownRain: boolean }> {
  const byDate = new Map(own.map((r) => [r.date, Number(r.rain_mm)]));
  return rows.map((row) => {
    const mm = byDate.get(row.date);
    return mm === undefined || !Number.isFinite(mm)
      ? { ...row, ownRain: false }
      : { ...row, precipitation_mm: mm, ownRain: true };
  });
}

export type RainInput = { ok: true; mm: number } | { ok: false; error: string };

/** Parses the amount typed on the rain page, in the person's units, to millimeters. */
export function rainFromForm(value: string, units: Units): RainInput {
  const raw = value.trim().replace(",", ".");
  const amount = raw === "" ? NaN : Number(raw);
  if (!Number.isFinite(amount) || amount < 0) return { ok: false, error: "Enter the rain that fell, 0 or more." };
  const mm = Math.round((units === "us" ? amount * MM_PER_INCH : amount) * 10) / 10;
  if (mm > OWN_RAIN_MAX_MM) {
    return { ok: false, error: units === "us" ? "That is more than 19 inches in a day." : "That is more than 500 mm in a day." };
  }
  return { ok: true, mm };
}

/** The amount shown in the form: inches with two decimals, or millimeters with one. */
export function rainForForm(mm: number, units: Units): string {
  return units === "us" ? String(Math.round((mm / MM_PER_INCH) * 100) / 100) : String(Math.round(mm * 10) / 10);
}

/** A date the rain page accepts: a real day, not after today and within the last year. */
export function isRainDate(date: string, today: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const t = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(t) || new Date(t).toISOString().slice(0, 10) !== date) return false;
  const limit = Date.parse(`${today}T00:00:00Z`) - 366 * 86_400_000;
  return date <= today && t >= limit;
}

/**
 * The owner's rain for a pool from a date on. Fails open: before the table exists, or on
 * any error, the cell's rain is used.
 */
export async function loadOwnRain(client: SupabaseClient, poolId: string, fromDate: string): Promise<OwnRain[]> {
  try {
    const { data, error } = await client
      .from("pool_rain")
      .select("date, rain_mm")
      .eq("pool_id", poolId)
      .gte("date", fromDate)
      .order("date")
      .limit(400)
      .returns<OwnRain[]>();
    if (error) {
      if (!/pool_rain/.test(error.message)) console.error(`[rain] pool ${poolId}: ${error.message}`);
      return [];
    }
    return data ?? [];
  } catch (err) {
    console.error(`[rain] pool ${poolId}: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}
