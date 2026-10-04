"use server";

import { headers } from "next/headers";
import { allowPlaceSearch } from "@/lib/forecast/limits";
import { searchPlaces, type Place } from "@/lib/weather/geocode";
import { visitorCountry } from "@/lib/weather/place-order";

/**
 * Town or ZIP search for the public forecast: no sign-in, limited per address, nothing
 * kept. Places in the visitor's country (Vercel's IP country header) come first; the
 * country is used only for that order, never stored or logged.
 */
export async function findForecastPlaces(query: string): Promise<{ places: Place[]; error?: string }> {
  if (typeof query !== "string" || query.trim().length < 2 || query.length > 100) return { places: [] };
  if (!(await allowPlaceSearch())) {
    return { places: [], error: "Too many searches from your connection. Try again in a few minutes." };
  }
  try {
    const country = visitorCountry((await headers()).get("x-vercel-ip-country"));
    return { places: await searchPlaces(query, { country }) };
  } catch {
    return { places: [], error: "Town lookup is not answering right now. Try again in a moment." };
  }
}
