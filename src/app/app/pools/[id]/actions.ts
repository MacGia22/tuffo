"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/user";
import { safeReturnTo, withSaved } from "@/lib/return-to";
import { formFields, instantInZone, isTimeZone, isUuid, text } from "@/lib/form-data";
import { scheduleFromForm } from "@/lib/pump";
import { saveDoseEntry, saveEventEntry, saveReadingEntry, type LogKind, type SaveResult } from "@/lib/log/save";
import { recomputeAfterResponse, recomputePoolModel } from "@/lib/model/recompute";
import { basicsFromForm, equipmentFromForm, isEquipmentKind } from "@/lib/equipment";
import { cellFromForm } from "@/lib/salt-cells";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cellFor } from "@/lib/weather/cells";
import { refreshCellIfStale } from "@/lib/weather/job";
import { isRainDate, rainFromForm } from "@/lib/weather/own-rain";
import { localDateRange } from "@/lib/weather/summary";
import type { Units } from "@/lib/format";

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
  revalidatePath(`/app/pools/${poolId}`, "layout");
  // Back where the person came from: "Saved", with Undo for a new entry.
  const back = safeReturnTo(text(formData, "return_to"), `/app/pools/${poolId}`);
  redirect(withSaved(back, !id && result.id ? `${kind}.${result.id}` : "1"));
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
  const { data: inserted, error } = await supabase
    .from("pump_schedules")
    .insert({
      pool_id: poolId,
      effective_from: effectiveFrom,
      segments: schedule.segments,
      cell_hours: schedule.cellHours,
      source: text(formData, "source") === "screenshot" ? "screenshot" : "manual",
    })
    .select("id")
    .returns<{ id: string }[]>();
  if (error) {
    return { error: /pump_schedules/.test(error.message) ? "This is not available yet. Try again in a few minutes." : `Could not save (${error.message}).` };
  }
  recomputeAfterResponse(poolId);
  revalidatePath(`/app/pools/${poolId}`, "layout");
  const back = safeReturnTo(text(formData, "return_to"), `/app/pools/${poolId}`);
  const newId = inserted?.[0]?.id;
  redirect(withSaved(back, newId ? `pump.${newId}` : "1"));
}

export interface RainState {
  error?: string;
}

/** Today's date in the pool's time zone. */
async function poolToday(poolId: string): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data: pool } = await supabase.from("pools").select("timezone").eq("id", poolId).maybeSingle<{ timezone: string | null }>();
  if (!pool) return null;
  const now = new Date().toISOString();
  return localDateRange(now, now, pool.timezone ?? "UTC").to;
}

/**
 * Stores the rain that fell at the pool on a day, in place of the weather cell's figure.
 * Refits the chlorine model and the plan after the response.
 */
export async function saveRain(_prev: RainState, formData: FormData): Promise<RainState> {
  const poolId = text(formData, "pool_id");
  if (!isUuid(poolId)) return { error: "Unknown pool." };
  const date = text(formData, "date");
  await requireUser(`/app/pools/${poolId}/rain?date=${encodeURIComponent(date)}`);
  const today = await poolToday(poolId);
  if (!today) return { error: "Unknown pool." };
  if (!isRainDate(date, today)) return { error: "Pick a day from the last year, up to today." };
  const units: Units = text(formData, "units") === "metric" ? "metric" : "us";
  const rain = rainFromForm(text(formData, "rain"), units);
  if (!rain.ok) return { error: rain.error };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("pool_rain")
    .upsert({ pool_id: poolId, date, rain_mm: rain.mm, updated_at: new Date().toISOString() }, { onConflict: "pool_id,date" });
  if (error) {
    return { error: /pool_rain/.test(error.message) ? "This is not available yet. Try again in a few minutes." : `Could not save (${error.message}).` };
  }
  recomputeAfterResponse(poolId);
  revalidatePath(`/app/pools/${poolId}`);
  redirect(withSaved(safeReturnTo(text(formData, "return_to"), `/app/pools/${poolId}`), "1"));
}

/** Goes back to the weather cell's rain for that day. */
export async function clearRain(formData: FormData): Promise<void> {
  const poolId = text(formData, "pool_id");
  const date = text(formData, "date");
  if (!isUuid(poolId) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
  await requireUser(`/app/pools/${poolId}`);
  const supabase = await createSupabaseServerClient();
  const { data: removed } = await supabase.from("pool_rain").delete().eq("pool_id", poolId).eq("date", date).select("date");
  if (removed && removed.length > 0) recomputeAfterResponse(poolId);
  revalidatePath(`/app/pools/${poolId}`);
  redirect(withSaved(safeReturnTo(text(formData, "return_to"), `/app/pools/${poolId}`), "1"));
}

export interface LocationState {
  error?: string;
  saved?: boolean;
}

/**
 * Moves a pool to the weather cell of a newly picked town or ZIP (on the current grid).
 * The new cell's weather is fetched with all the history the API has, then the chlorine
 * model and the plan are refitted, after the response. A cell no pool uses any more
 * stops being refreshed.
 */
export async function saveLocation(_prev: LocationState, formData: FormData): Promise<LocationState> {
  const poolId = text(formData, "pool_id");
  if (!isUuid(poolId)) return { error: "Unknown pool." };
  await requireUser(`/app/pools/${poolId}/location`);
  const lat = Number(text(formData, "lat"));
  const lon = Number(text(formData, "lon"));
  const timezone = text(formData, "timezone");
  const placeLabel = text(formData, "place_label");
  if (!text(formData, "lat") || !text(formData, "lon") || !placeLabel || !isTimeZone(timezone)) {
    return { error: "Search for your ZIP code or town and pick it from the list." };
  }
  let cell;
  try {
    cell = cellFor(lat, lon);
  } catch {
    return { error: "That location is not valid. Search for your town again." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: pool } = await supabase.from("pools").select("cell_id").eq("id", poolId).maybeSingle<{ cell_id: string | null }>();
  if (!pool) return { error: "Unknown pool." };

  // Weather cells are shared reference data; the server creates them, never the browser.
  const admin = createSupabaseAdminClient();
  const { error: cellError } = await admin
    .from("weather_cells")
    .upsert({ id: cell.id, lat: cell.lat, lon: cell.lon, timezone, active: true }, { onConflict: "id" });
  if (cellError) return { error: `Could not register the weather location (${cellError.message}).` };

  const { error } = await supabase
    .from("pools")
    .update({ cell_id: cell.id, place_label: placeLabel.slice(0, 120), timezone })
    .eq("id", poolId);
  if (error) return { error: `Could not save (${error.message}).` };

  const oldCell = pool.cell_id;
  const newCell = cell.id;
  after(async () => {
    try {
      if (oldCell && oldCell !== newCell) {
        const { count } = await admin.from("pools").select("id", { count: "exact", head: true }).eq("cell_id", oldCell);
        if (count === 0) await admin.from("weather_cells").update({ active: false }).eq("id", oldCell);
      }
      await refreshCellIfStale(admin, newCell, { backfill: true });
      await recomputePoolModel(admin, poolId);
      const { refreshPlan } = await import("@/lib/plan/build");
      await refreshPlan(admin, poolId);
    } catch (err) {
      console.error(`[location] pool ${poolId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  });
  revalidatePath(`/app/pools/${poolId}`);
  revalidatePath("/app");
  redirect(withSaved(safeReturnTo(text(formData, "return_to"), `/app/pools/${poolId}`), "1"));
}

export interface SettingsState {
  error?: string;
  saved?: boolean;
}

/** Reads one form field as text, or null when it is missing. */
function field(formData: FormData) {
  return (name: string) => {
    const v = formData.get(name);
    return typeof v === "string" ? v : null;
  };
}

/** Name, volume, sanitizer, surface and cover. Refits the model and the plan. */
export async function savePoolBasics(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const poolId = text(formData, "pool_id");
  if (!isUuid(poolId)) return { error: "Unknown pool." };
  await requireUser(`/app/pools/${poolId}/settings`);
  const basics = basicsFromForm(field(formData));
  if (!basics.ok) return { error: basics.error };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("pools")
    .update({
      name: basics.name,
      volume_l: basics.volumeL,
      sanitizer: basics.sanitizer,
      surface: basics.surface,
      covered: basics.covered,
    })
    .eq("id", poolId)
    .select("id");
  if (error) return { error: `Could not save (${error.message}).` };
  if (!data || data.length === 0) return { error: "Unknown pool." };
  recomputeAfterResponse(poolId);
  revalidatePath(`/app/pools/${poolId}`);
  revalidatePath(`/app/pools/${poolId}/settings`);
  revalidatePath("/app");
  return { saved: true };
}

interface CurrentEquipment {
  id: string;
  installed_on: string;
}

/**
 * Saves a pump, feeder, filter or heater. Without "replaced", the current item is
 * corrected in place; with it (or when there is none), the current one is dated as
 * removed and the new one starts on the given day, so the history stays true.
 */
export async function saveEquipment(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const poolId = text(formData, "pool_id");
  const kind = text(formData, "kind");
  if (!isUuid(poolId) || !isEquipmentKind(kind)) return { error: "Unknown equipment." };
  await requireUser(`/app/pools/${poolId}/settings`);
  const item = equipmentFromForm(kind, field(formData));
  if (!item.ok) return { error: item.error };

  const today = await poolToday(poolId);
  if (!today) return { error: "Unknown pool." };
  const since = text(formData, "since") || today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since) || since > today) return { error: "Pick the day it was installed, up to today." };

  const supabase = await createSupabaseServerClient();
  const unavailable = (message: string) =>
    /pool_equipment/.test(message) ? "This is not available yet. Try again in a few minutes." : `Could not save (${message}).`;
  const { data: current, error: readError } = await supabase
    .from("pool_equipment")
    .select("id, installed_on")
    .eq("pool_id", poolId)
    .eq("kind", kind)
    .is("removed_on", null)
    .maybeSingle<CurrentEquipment>();
  if (readError) return { error: unavailable(readError.message) };

  const replaced = formData.get("replaced") === "on";
  if (current && !replaced) {
    // A corrected install date (used for its age on the maintenance page).
    const installedOn = text(formData, "since") ? since : current.installed_on;
    const { error } = await supabase
      .from("pool_equipment")
      .update({ model: item.model, details: item.details, installed_on: installedOn })
      .eq("id", current.id);
    if (error) return { error: unavailable(error.message) };
  } else {
    if (current) {
      if (since < current.installed_on) return { error: "The new one cannot start before the old one was installed." };
      const { error } = await supabase.from("pool_equipment").update({ removed_on: since }).eq("id", current.id);
      if (error) return { error: unavailable(error.message) };
    }
    const { error } = await supabase
      .from("pool_equipment")
      .insert({ pool_id: poolId, kind, model: item.model, details: item.details, installed_on: since });
    if (error) return { error: unavailable(error.message) };
  }
  revalidatePath(`/app/pools/${poolId}/settings`);
  return { saved: true };
}

/** Dates the current item of a kind as removed today; it stays in the history. */
export async function removeEquipment(formData: FormData): Promise<void> {
  const poolId = text(formData, "pool_id");
  const kind = text(formData, "kind");
  if (!isUuid(poolId) || !isEquipmentKind(kind)) return;
  await requireUser(`/app/pools/${poolId}/settings`);
  const today = await poolToday(poolId);
  if (!today) return;
  const supabase = await createSupabaseServerClient();
  await supabase
    .from("pool_equipment")
    .update({ removed_on: today })
    .eq("pool_id", poolId)
    .eq("kind", kind)
    .is("removed_on", null)
    .lte("installed_on", today);
  revalidatePath(`/app/pools/${poolId}/settings`);
}

export interface DeleteState {
  error?: string;
}

/**
 * Deletes a pool and everything logged for it (tests, doses, events, plan, equipment,
 * rain, alerts settings), after the owner types its name. Cannot be undone. A weather
 * cell no other pool uses stops being refreshed.
 */
export async function deletePool(_prev: DeleteState, formData: FormData): Promise<DeleteState> {
  const poolId = text(formData, "pool_id");
  if (!isUuid(poolId)) return { error: "Unknown pool." };
  await requireUser(`/app/pools/${poolId}/settings`);
  const supabase = await createSupabaseServerClient();
  const { data: pool } = await supabase
    .from("pools")
    .select("name, cell_id")
    .eq("id", poolId)
    .maybeSingle<{ name: string; cell_id: string | null }>();
  if (!pool) return { error: "Unknown pool." };
  if (text(formData, "confirm_name") !== pool.name.trim()) {
    return { error: `Type the pool's name, ${pool.name.trim()}, to delete it.` };
  }

  const { data: removed, error } = await supabase.from("pools").delete().eq("id", poolId).select("id");
  if (error) return { error: `Could not delete (${error.message}).` };
  if (!removed || removed.length === 0) return { error: "Unknown pool." };

  const cellId = pool.cell_id;
  if (cellId) {
    after(async () => {
      try {
        const admin = createSupabaseAdminClient();
        const { count } = await admin.from("pools").select("id", { count: "exact", head: true }).eq("cell_id", cellId);
        if (count === 0) await admin.from("weather_cells").update({ active: false }).eq("id", cellId);
      } catch (err) {
        console.error(`[pools] cell ${cellId} after delete: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
  }
  revalidatePath("/app");
  redirect("/app");
}
