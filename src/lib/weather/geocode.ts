import "server-only";

import { labelFor, parseQuery, rankResults, type GeoResult } from "./place-query";

/**
 * Town or postal-code lookup through Open-Meteo's geocoding API (free for
 * non-commercial use; the commercial plan covers it once Tuffo charges). Called from
 * the server so the user's IP is never sent to a third party, and nothing typed here
 * is stored: only the chosen place's 0.05° cell, town name and timezone are kept.
 */

export interface Place {
  label: string;
  lat: number;
  lon: number;
  timezone: string;
  country: string;
}

const ENDPOINT = "https://geocoding-api.open-meteo.com/v1/search";

async function lookup(name: string, count: number): Promise<GeoResult[]> {
  const url = new URL(ENDPOINT);
  url.searchParams.set("name", name);
  url.searchParams.set("count", String(count));
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");

  const response = await fetch(url, {
    headers: { "User-Agent": "Tuffo/0.1 (https://tuffo.app)" },
    signal: AbortSignal.timeout(6000),
    next: { revalidate: 86400 },
  });
  if (!response.ok) throw new Error(`geocoding failed: ${response.status}`);
  const data = (await response.json()) as { results?: GeoResult[] };
  return data.results ?? [];
}

export async function searchPlaces(query: string, limit = 6): Promise<Place[]> {
  const parsed = parseQuery(query);
  const names = parsed.names.filter((n) => n.length >= 2 && n.length <= 80);
  if (names.length === 0) return [];

  const batches = await Promise.all(names.map((n) => lookup(n, parsed.postal ? 5 : 10).catch(() => [] as GeoResult[])));
  const ranked = rankResults(batches.flat(), parsed.qualifier);

  return ranked.slice(0, limit).map((r) => ({
    label: labelFor(r),
    lat: r.latitude,
    lon: r.longitude,
    timezone: r.timezone,
    country: r.country_code ?? "",
  }));
}
