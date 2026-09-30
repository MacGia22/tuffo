"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/user";
import { formFields, instantInZone, isTimeZone, isUuid, text } from "@/lib/form-data";
import { scheduleFromForm } from "@/lib/pump";
import { saveDoseEntry, saveEventEntry, saveReadingEntry, type LogKind, type SaveResult } from "@/lib/log/save";
import { recomputeAfterResponse } from "@/lib/model/recompute";
import { cellFromForm } from "@/lib/salt-cells";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface LogState {
  error?: string;
  fields?: Record<string, string>;
}

const PATHS: Record<LogKind, string> = { reading: "readings", dose: "doses", event: "events" };

/** Shared by the three log forms: sign-in check, save, then back to the pool. */
async function save(kind: LogKind, formData: FormData, saver: (f: FormData) => Promise<SaveResult>): Promise<LogState> {
  const poolId = text(formData, "pool_id");
  if (!isUuid(poolId)) return { error: "Unknown pool." };
  const id = text(formData, "id");
  await requireUser(`/app/pools/${poolId}/${PATHS[kind]}/${id && isUuid(id) ? `${id}/edit` : "new"}`);

  const result = await saver(formData);
  if (!result.ok) return { error: result.error, fields: formFields(formData) };
  revalidatePath(`/app/pools/${poolId}`);
  redirect(`/app/pools/${poolId}`);
}

/** Saves a new test, or changes one when the form carries an `id`. */
export async function saveReading(_prev: LogState, formData: FormData): Promise<LogState> {
  return save("reading", formData, saveReadingEntry);
}

export async function saveDose(_prev: LogState, formData: FormData): Promise<LogState> {
  return save("dose", formData, saveDoseEntry);
}

export async function saveEvent(_prev: LogState, formData: FormData): Promise<LogState> {
  return save("event", formData, saveEventEntry);
}

const TABLES = { reading: "readings", dose: "doses", event: "events" } as const;

/** Removes one test, dose or event. Row-level security limits it to the owner's pools. */
export async function deleteEntry(formData: FormData): Promise<void> {
  const poolId = text(formData, "pool_id");
  const id = text(formData, "id");
  const kind = text(formData, "kind") as keyof typeof TABLES;
  if (!isUuid(poolId) || !isUuid(id) || !(kind in TABLES)) return;
  await requireUser(`/app/pools/${poolId}`);

  const supabase = await createSupabaseServerClient();
  const { data: removed } = await supabase.from(TABLES[kind]).delete().eq("id", id).eq("pool_id", poolId).select("id");
  // A removed test, dose or event changes what the chlorine model learned from.
  if (removed && removed.length > 0) recomputeAfterResponse(poolId);
  revalidatePath(`/app/pools/${poolId}`);
}

export interface CellState {
  error?: string;
  saved?: boolean;
}

/**
 * Stores a salt pool's cell: a listed model with its rated output, or a rating from the
 * label. The chlorine model and the 7-day plan are refitted after the response.
 */
export async function saveSaltCell(_prev: CellState, formData: FormData): Promise<CellState> {
  const poolId = text(formData, "pool_id");
  if (!isUuid(poolId)) return { error: "Unknown pool." };
  await requireUser(`/app/pools/${poolId}`);
  const choice = cellFromForm({ model: text(formData, "model"), value: text(formData, "value"), unit: text(formData, "unit") });
  if (!choice.ok) return { error: choice.error };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("pools")
    .update({ swg_cell_lb_per_day: choice.lbPerDay, swg_cell_model: choice.model })
    .eq("id", poolId)
    .eq("sanitizer", "swg")
    .select("id");
  if (error) {
    return { error: /swg_cell_model/.test(error.message) ? "This is not available yet. Try again in a few minutes." : `Could not save (${error.message}).` };
  }
  if (!data || data.length === 0) return { error: "Only salt pools have a cell." };
  recomputeAfterResponse(poolId);
  revalidatePath(`/app/pools/${poolId}`);
  return { saved: true };
}

export interface PumpState {
  error?: string;
  saved?: boolean;
}

/**
 * Stores a pump schedule from the given date on (a new row; earlier ones stay as the
 * history the chlorine model reads). Refits the model and the plan after the response.
 */
export async function savePumpSchedule(_prev: PumpState, formData: FormData): Promise<PumpState> {
  const poolId = text(formData, "pool_id");
  if (!isUuid(poolId)) return { error: "Unknown pool." };
  await requireUser(`/app/pools/${poolId}/pump`);
  const schedule = scheduleFromForm((name) => {
    const v = formData.get(name);
    return typeof v === "string" ? v : null;
  });
  if (!schedule.ok) return { error: schedule.error };

  const since = text(formData, "since");
  const timeZone = text(formData, "time_zone");
  let effectiveFrom = new Date().toISOString();
  if (since) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(since) || !isTimeZone(timeZone)) return { error: "Pick the date the schedule started." };
    const when = instantInZone(`${since}T00:00`, timeZone);
    if (!when.ok || !when.iso) return { error: when.ok ? "Pick the date the schedule started." : when.error };
    effectiveFrom = when.iso;
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("pump_schedules").insert({
    pool_id: poolId,
    effective_from: effectiveFrom,
    segments: schedule.segments,
    cell_hours: schedule.cellHours,
    source: text(formData, "source") === "screenshot" ? "screenshot" : "manual",
  });
  if (error) {
    return { error: /pump_schedules/.test(error.message) ? "This is not available yet. Try again in a few minutes." : `Could not save (${error.message}).` };
  }
  recomputeAfterResponse(poolId);
  revalidatePath(`/app/pools/${poolId}`);
  revalidatePath(`/app/pools/${poolId}/pump`);
  return { saved: true };
}
