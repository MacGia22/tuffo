"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/user";
import { displayVolumeToLiters, type Units } from "@/lib/format";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cellFor } from "@/lib/weather/cells";
import { searchPlaces, type Place } from "@/lib/weather/geocode";

export interface PlaceSearchResult {
  places: Place[];
  error?: string;
}

export async function findPlaces(query: string): Promise<PlaceSearchResult> {
  await requireUser();
  try {
    const places = await searchPlaces(query);
    return { places };
  } catch {
    return { places: [], error: "Town lookup is not answering right now. Try again in a moment." };
  }
}

export interface CreatePoolState {
  error?: string;
  fields?: Record<string, string>;
}

const SANITIZERS = new Set(["chlorine", "swg"]);
const SURFACES = new Set(["plaster", "vinyl", "fiberglass"]);

function text(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function num(formData: FormData, name: string): number | null {
  const raw = text(formData, name).replace(/,/g, "");
  if (raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export async function createPool(_prev: CreatePoolState, formData: FormData): Promise<CreatePoolState> {
  const user = await requireUser("/app/pools/new");
  const fields = Object.fromEntries(
    [...formData.entries()].filter(([, v]) => typeof v === "string").map(([k, v]) => [k, v as string]),
  );
  const fail = (error: string): CreatePoolState => ({ error, fields });

  const name = text(formData, "name");
  if (name.length < 1 || name.length > 80) return fail("Give the pool a name (up to 80 characters).");

  const units: Units = text(formData, "units") === "metric" ? "metric" : "us";
  const volumeInput = num(formData, "volume");
  if (volumeInput === null || volumeInput <= 0) return fail("Enter the pool volume.");
  const volumeL = displayVolumeToLiters(volumeInput, units);
  if (volumeL < 500 || volumeL > 5_000_000) return fail("That volume does not look right for a pool.");

  const sanitizer = text(formData, "sanitizer");
  if (!SANITIZERS.has(sanitizer)) return fail("Pick a sanitizer.");
  const surface = text(formData, "surface");
  if (!SURFACES.has(surface)) return fail("Pick a surface.");
  const covered = formData.get("covered") === "on";

  const lat = num(formData, "lat");
  const lon = num(formData, "lon");
  const timezone = text(formData, "timezone");
  const placeLabel = text(formData, "place_label");
  if (lat === null || lon === null || !timezone || !placeLabel) {
    return fail("Search for your town and pick it from the list, so Tuffo knows which weather to use.");
  }

  let cell;
  try {
    cell = cellFor(lat, lon);
  } catch {
    return fail("That location is not valid. Search for your town again.");
  }

  // Weather cells are shared reference data; the server creates them, never the browser.
  const admin = createSupabaseAdminClient();
  const { error: cellError } = await admin
    .from("weather_cells")
    .upsert({ id: cell.id, lat: cell.lat, lon: cell.lon, timezone, active: true }, { onConflict: "id" });
  if (cellError) return fail(`Could not register the weather location (${cellError.message}).`);

  const supabase = await createSupabaseServerClient();
  const { data: pool, error } = await supabase
    .from("pools")
    .insert({
      owner_id: user.id,
      name,
      volume_l: Math.round(volumeL),
      sanitizer,
      surface,
      covered,
      cell_id: cell.id,
      place_label: placeLabel.slice(0, 120),
      timezone,
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !pool) return fail(`Could not save the pool (${error?.message ?? "unknown error"}).`);

  // First pool: remember the unit system the user typed in.
  await supabase.from("profiles").update({ units }).eq("id", user.id);

  redirect(`/app/pools/${pool.id}`);
}
