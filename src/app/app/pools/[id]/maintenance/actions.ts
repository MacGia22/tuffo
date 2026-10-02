"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/user";
import { isUuid, text } from "@/lib/form-data";
import { displayPressureToKpa, pressureFieldValue, type Units } from "@/lib/format";
import { intervalFromForm, taskById } from "@/lib/maintenance";
import { poolLocalDate } from "@/lib/maintenance-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Upkeep log, filter pressure, task intervals and the salt cell's install date. Row-level
 * security limits every write to the owner's pools.
 */

export interface MaintenanceState {
  error?: string;
  saved?: boolean;
  /** The row just added, for Undo. */
  undoId?: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function refresh(poolId: string) {
  revalidatePath(`/app/pools/${poolId}`);
  revalidatePath(`/app/pools/${poolId}/maintenance`);
  revalidatePath(`/app/pools/${poolId}/settings`);
}

function unavailable(message: string): string {
  return /pool_maintenance|pool_pressure|maintenance_intervals|swg_cell_installed_on/.test(message)
    ? "This is not available yet. Try again in a few minutes."
    : `Could not save (${message}).`;
}

/** Today at the pool, or null when the pool is not the person's. */
async function poolToday(poolId: string): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data: pool } = await supabase.from("pools").select("timezone").eq("id", poolId).maybeSingle<{ timezone: string | null }>();
  return pool ? poolLocalDate(pool.timezone) : null;
}

/** A date from the form (empty: today), up to today. */
function dateField(formData: FormData, name: string, today: string): string | null {
  const value = text(formData, name) || today;
  return DATE.test(value) && value <= today && value >= "2000-01-01" ? value : null;
}

/** Marks a task done on a day (today unless one is given). */
export async function logMaintenance(_prev: MaintenanceState, formData: FormData): Promise<MaintenanceState> {
  const poolId = text(formData, "pool_id");
  const task = taskById(text(formData, "task"));
  if (!isUuid(poolId) || !task) return { error: "Unknown task." };
  await requireUser(`/app/pools/${poolId}/maintenance`);
  const today = await poolToday(poolId);
  if (!today) return { error: "Unknown pool." };
  const doneOn = dateField(formData, "done_on", today);
  if (!doneOn) return { error: "Pick the day you did it, up to today." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("pool_maintenance")
    .insert({ pool_id: poolId, task: task.id, done_on: doneOn })
    .select("id")
    .returns<{ id: string }[]>();
  if (error) return { error: unavailable(error.message) };
  refresh(poolId);
  return { saved: true, undoId: data?.[0]?.id };
}

/** Removes one logged completion (a mistake). */
export async function deleteMaintenance(formData: FormData): Promise<void> {
  const poolId = text(formData, "pool_id");
  const id = text(formData, "id");
  if (!isUuid(poolId) || !isUuid(id)) return;
  await requireUser(`/app/pools/${poolId}/maintenance`);
  const supabase = await createSupabaseServerClient();
  await supabase.from("pool_maintenance").delete().eq("id", id).eq("pool_id", poolId);
  refresh(poolId);
}

/**
 * Changes the day of a logged task. Rows are never edited in place (owners may add and
 * remove, not update): the new row is added first, then the old one removed.
 */
export async function editMaintenance(poolId: string, id: string, doneOn: string): Promise<MaintenanceState> {
  if (!isUuid(poolId) || !isUuid(id)) return { error: "Unknown entry." };
  await requireUser(`/app/pools/${poolId}/maintenance`);
  const today = await poolToday(poolId);
  if (!today) return { error: "Unknown pool." };
  if (!DATE.test(doneOn) || doneOn > today || doneOn < "2000-01-01") return { error: "Pick the day, up to today." };
  const supabase = await createSupabaseServerClient();
  const { data: old } = await supabase
    .from("pool_maintenance")
    .select("task")
    .eq("id", id)
    .eq("pool_id", poolId)
    .maybeSingle<{ task: string }>();
  if (!old) return { error: "It may already be gone." };
  const { error } = await supabase.from("pool_maintenance").insert({ pool_id: poolId, task: old.task, done_on: doneOn });
  if (error) return { error: unavailable(error.message) };
  await supabase.from("pool_maintenance").delete().eq("id", id).eq("pool_id", poolId);
  refresh(poolId);
  return { saved: true };
}

/** Changes a pressure reading (day, value, clean): the new row first, then the old one removed. */
export async function editPressure(
  poolId: string,
  id: string,
  input: { readOn: string; pressure: string; clean: boolean; units: Units },
): Promise<MaintenanceState> {
  if (!isUuid(poolId) || !isUuid(id)) return { error: "Unknown reading." };
  await requireUser(`/app/pools/${poolId}/maintenance`);
  const value = input.pressure.trim() === "" ? NaN : Number(input.pressure.replace(/,/g, "."));
  if (!Number.isFinite(value) || value < 0) return { error: "Enter the gauge reading." };
  const supabase = await createSupabaseServerClient();
  const { data: old } = await supabase
    .from("pool_pressure")
    .select("kpa")
    .eq("id", id)
    .eq("pool_id", poolId)
    .maybeSingle<{ kpa: number | string }>();
  // An unchanged field keeps the stored value: only the day or the clean box changed.
  const unchanged = old && input.pressure.trim() === pressureFieldValue(Number(old.kpa), input.units);
  const kpa = unchanged ? Number(old.kpa) : Math.round(displayPressureToKpa(value, input.units) * 10) / 10;
  if (kpa > 400) return { error: input.units === "us" ? "Pool filter gauges read up to about 58 psi." : "Pool filter gauges read up to about 4 bar." };
  const today = await poolToday(poolId);
  if (!today) return { error: "Unknown pool." };
  if (!DATE.test(input.readOn) || input.readOn > today || input.readOn < "2000-01-01") return { error: "Pick the day, up to today." };
  const { error } = await supabase
    .from("pool_pressure")
    .insert({ pool_id: poolId, read_on: input.readOn, kpa, clean: input.clean });
  if (error) return { error: unavailable(error.message) };
  await supabase.from("pool_pressure").delete().eq("id", id).eq("pool_id", poolId);
  refresh(poolId);
  return { saved: true };
}

/** Stores a filter pressure reading, in kPa. */
export async function logPressure(_prev: MaintenanceState, formData: FormData): Promise<MaintenanceState> {
  const poolId = text(formData, "pool_id");
  if (!isUuid(poolId)) return { error: "Unknown pool." };
  await requireUser(`/app/pools/${poolId}/maintenance`);
  const units: Units = text(formData, "units") === "metric" ? "metric" : "us";
  const raw = text(formData, "pressure").replace(/,/g, ".");
  const value = raw === "" ? NaN : Number(raw);
  if (!Number.isFinite(value) || value < 0) return { error: "Enter the gauge reading." };
  const kpa = Math.round(displayPressureToKpa(value, units) * 10) / 10;
  if (kpa > 400) return { error: units === "us" ? "Pool filter gauges read up to about 58 psi." : "Pool filter gauges read up to about 4 bar." };
  const today = await poolToday(poolId);
  if (!today) return { error: "Unknown pool." };
  const readOn = dateField(formData, "read_on", today);
  if (!readOn) return { error: "Pick the day, up to today." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("pool_pressure")
    .insert({ pool_id: poolId, read_on: readOn, kpa, clean: formData.get("clean") === "on" })
    .select("id")
    .returns<{ id: string }[]>();
  if (error) return { error: unavailable(error.message) };
  refresh(poolId);
  return { saved: true, undoId: data?.[0]?.id };
}

export async function deletePressure(formData: FormData): Promise<void> {
  const poolId = text(formData, "pool_id");
  const id = text(formData, "id");
  if (!isUuid(poolId) || !isUuid(id)) return;
  await requireUser(`/app/pools/${poolId}/maintenance`);
  const supabase = await createSupabaseServerClient();
  await supabase.from("pool_pressure").delete().eq("id", id).eq("pool_id", poolId);
  refresh(poolId);
}

/** Sets how often a task is due, or puts it back to the default. */
export async function saveInterval(_prev: MaintenanceState, formData: FormData): Promise<MaintenanceState> {
  const poolId = text(formData, "pool_id");
  const task = taskById(text(formData, "task"));
  if (!isUuid(poolId) || !task) return { error: "Unknown task." };
  await requireUser(`/app/pools/${poolId}/maintenance`);
  const reset = formData.get("reset") === "1";
  const days = reset ? null : intervalFromForm(text(formData, "count"), text(formData, "unit"));
  if (!reset && days === null) return { error: "Enter how often, from 1 day to 10 years." };

  const supabase = await createSupabaseServerClient();
  const { data: pool, error: readError } = await supabase
    .from("pools")
    .select("maintenance_intervals")
    .eq("id", poolId)
    .maybeSingle<{ maintenance_intervals: Record<string, unknown> | null }>();
  if (readError) return { error: unavailable(readError.message) };
  if (!pool) return { error: "Unknown pool." };
  const intervals = { ...(pool.maintenance_intervals ?? {}) };
  if (days === null || days === task.defaultDays) delete intervals[task.id];
  else intervals[task.id] = days;
  const { error } = await supabase.from("pools").update({ maintenance_intervals: intervals }).eq("id", poolId);
  if (error) return { error: unavailable(error.message) };
  refresh(poolId);
  return { saved: true };
}

