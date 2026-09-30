"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/user";
import { formFields, isUuid, text } from "@/lib/form-data";
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
