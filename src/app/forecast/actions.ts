"use server";

import { allowPlaceSearch } from "@/lib/forecast/limits";
import { searchPlaces, type Place } from "@/lib/weather/geocode";

/** Town or ZIP search for the public forecast: no sign-in, limited per address, nothing kept. */
export async function findForecastPlaces(query: string): Promise<{ places: Place[]; error?: string }> {
  if (typeof query !== "string" || query.trim().length < 2 || query.length > 100) return { places: [] };
  if (!(await allowPlaceSearch())) {
    return { places: [], error: "Too many searches from your connection. Try again in a few minutes." };
  }
  try {
    return { places: await searchPlaces(query) };
  } catch {
    return { places: [], error: "Town lookup is not answering right now. Try again in a moment." };
  }
}
