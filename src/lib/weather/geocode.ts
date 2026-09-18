import "server-only";

/**
 * Town lookup through Open-Meteo's geocoding API (free for non-commercial use;
 * the commercial plan covers it once Tuffo charges). Called from the server so the
 * user's IP is never sent to a third party.
 */

export interface Place {
  label: string;
  lat: number;
  lon: number;
  timezone: string;
  country: string;
}

interface OpenMeteoResult {
  name: string;
  latitude: number;
  longitude: number;
  timezone: string;
  country_code?: string;
  country?: string;
  admin1?: string;
  admin2?: string;
  feature_code?: string;
}

const ENDPOINT = "https://geocoding-api.open-meteo.com/v1/search";

export async function searchPlaces(query: string, count = 6): Promise<Place[]> {
  const name = query.trim();
  if (name.length < 2 || name.length > 80) return [];

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

  const data = (await response.json()) as { results?: OpenMeteoResult[] };
  return (data.results ?? [])
    .filter((r) => Number.isFinite(r.latitude) && Number.isFinite(r.longitude) && r.timezone)
    .map((r) => ({
      label: [r.name, r.admin1, r.country_code === "US" ? "US" : r.country]
        .filter((part, index, all) => part && all.indexOf(part) === index)
        .join(", "),
      lat: r.latitude,
      lon: r.longitude,
      timezone: r.timezone,
      country: r.country_code ?? "",
    }));
}
