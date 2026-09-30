"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/user";
import type { Units } from "@/lib/format";
import { formFields, isUuid, optionalNumber, text, whenFromForm } from "@/lib/form-data";
import { recomputeAfterResponse } from "@/lib/model/recompute";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface ReadingState {
  error?: string;
  fields?: Record<string, string>;
}

const METHODS = new Set(["drop_kit", "strips", "digital", "store_leslies", "store_pinch", "monitor", "other"]);

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

/**
 * Saves a test: a new one, or, when the form carries an `id`, changes to an existing
 * one (row-level security limits both to the owner's pools). Either way the pool's
 * chlorine model is refitted after the response.
 */
export async function saveReading(_prev: ReadingState, formData: FormData): Promise<ReadingState> {
  const poolId = text(formData, "pool_id");
  if (!isUuid(poolId)) return { error: "Unknown pool." };
  const id = text(formData, "id");
  if (id && !isUuid(id)) return { error: "Unknown test." };
  await requireUser(id ? `/app/pools/${poolId}/readings/${id}/edit` : `/app/pools/${poolId}/readings/new`);

  const fields = formFields(formData);
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

  const when = whenFromForm(formData, "taken_at");
  if (!when.ok) return fail(when.error);
  if ("iso" in when && when.iso) row.taken_at = when.iso;

  const notes = text(formData, "notes");
  if (notes.length > 2000) return fail("Notes are limited to 2,000 characters.");
  row.notes = notes || null;

  const supabase = await createSupabaseServerClient();
  if (id) {
    const { data, error } = await supabase.from("readings").update(row).eq("id", id).eq("pool_id", poolId).select("id");
    if (error) return fail(`Could not save the test (${error.message}).`);
    if (!data || data.length === 0) return fail("That test is no longer there.");
  } else {
    const { error } = await supabase.from("readings").insert(row);
    if (error) return fail(`Could not save the test (${error.message}).`);
  }

  recomputeAfterResponse(poolId);
  revalidatePath(`/app/pools/${poolId}`);
  redirect(`/app/pools/${poolId}`);
}
