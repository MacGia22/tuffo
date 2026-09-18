"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/user";
import type { Units } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface ReadingState {
  error?: string;
  fields?: Record<string, string>;
}

const METHODS = new Set(["drop_kit", "strips", "digital", "store_leslies", "store_pinch", "monitor", "other"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Range {
  min: number;
  max: number;
  label: string;
}

const RANGES: Record<string, Range> = {
  fc: { min: 0, max: 100, label: "Free chlorine" },
  cc: { min: 0, max: 50, label: "Combined chlorine" },
  ph: { min: 5, max: 10, label: "pH" },
  ta: { min: 0, max: 1000, label: "Alkalinity" },
  ch: { min: 0, max: 3000, label: "Calcium" },
  cya: { min: 0, max: 500, label: "Stabilizer" },
  salt: { min: 0, max: 20000, label: "Salt" },
  borate: { min: 0, max: 200, label: "Borates" },
  phosphate: { min: 0, max: 20000, label: "Phosphates" },
};

function text(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function optionalNumber(formData: FormData, name: string): number | null | "invalid" {
  const raw = text(formData, name).replace(/,/g, "");
  if (raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : "invalid";
}

export async function createReading(_prev: ReadingState, formData: FormData): Promise<ReadingState> {
  const poolId = text(formData, "pool_id");
  if (!UUID.test(poolId)) return { error: "Unknown pool." };
  await requireUser(`/app/pools/${poolId}/readings/new`);

  const fields = Object.fromEntries(
    [...formData.entries()].filter(([, v]) => typeof v === "string").map(([k, v]) => [k, v as string]),
  );
  const fail = (error: string): ReadingState => ({ error, fields });

  const row: Record<string, number | string | null> = { pool_id: poolId };
  let any = false;
  for (const [key, range] of Object.entries(RANGES)) {
    const value = optionalNumber(formData, key);
    if (value === "invalid") return fail(`${range.label} must be a number.`);
    if (value !== null && (value < range.min || value > range.max)) {
      return fail(`${range.label} ${value} is outside the range a test can report.`);
    }
    row[key] = value;
    if (value !== null) any = true;
  }
  if (!any) return fail("Enter at least one result.");

  const units: Units = text(formData, "units") === "metric" ? "metric" : "us";
  const temp = optionalNumber(formData, "water_temp");
  if (temp === "invalid") return fail("Water temperature must be a number.");
  if (temp !== null) {
    const celsius = units === "us" ? ((temp - 32) * 5) / 9 : temp;
    if (celsius < -5 || celsius > 60) return fail("That water temperature does not look right.");
    row.water_temp_c = Math.round(celsius * 10) / 10;
  } else {
    row.water_temp_c = null;
  }

  const method = text(formData, "method") || "drop_kit";
  if (!METHODS.has(method)) return fail("Pick how the water was tested.");
  row.method = method;

  const takenAt = text(formData, "taken_at");
  if (takenAt) {
    // datetime-local has no zone; interpret in the pool's timezone offset sent by the form.
    const offsetMinutes = Number(text(formData, "tz_offset") || "0");
    const local = new Date(`${takenAt}:00Z`);
    if (Number.isNaN(local.getTime())) return fail("The date and time are not valid.");
    const instant = new Date(local.getTime() + offsetMinutes * 60_000);
    if (instant.getTime() > Date.now() + 60 * 60_000) return fail("The test time is in the future.");
    row.taken_at = instant.toISOString();
  }

  const notes = text(formData, "notes");
  if (notes.length > 2000) return fail("Notes are limited to 2,000 characters.");
  row.notes = notes || null;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("readings").insert(row);
  if (error) return fail(`Could not save the test (${error.message}).`);

  redirect(`/app/pools/${poolId}`);
}
