import "server-only";

/**
 * Open-Meteo forecast API client for weather cells. One request serves many cells
 * (coordinates are passed as lists); past days come back from the model analysis and
 * are stored as actuals, today onwards as forecast.
 *
 * Free for non-commercial use with attribution; move to the commercial plan when
 * Tuffo charges. https://open-meteo.com/en/docs
 */

export interface DailyWeather {
  date: string; // YYYY-MM-DD, local to the cell
  tmax_c: number | null;
  tmin_c: number | null;
  uv_index_max: number | null;
  shortwave_mj_m2: number | null;
  sunshine_s: number | null;
  precipitation_mm: number | null;
  precipitation_probability: number | null;
  wind_max_kmh: number | null;
  humidity_mean: number | null;
  et0_mm: number | null;
}

export interface CellWeather {
  lat: number;
  lon: number;
  timezone: string;
  actuals: DailyWeather[];
  forecast: DailyWeather[];
}

const DAILY = [
  "temperature_2m_max",
  "temperature_2m_min",
  "uv_index_max",
  "shortwave_radiation_sum",
  "sunshine_duration",
  "precipitation_sum",
  "precipitation_probability_max",
  "wind_speed_10m_max",
  "relative_humidity_2m_mean",
  "et0_fao_evapotranspiration",
] as const;

type DailyKey = (typeof DAILY)[number];

interface OpenMeteoLocation {
  latitude: number;
  longitude: number;
  timezone: string;
  daily: { time: string[] } & Partial<Record<DailyKey, Array<number | null>>>;
}

export const OPEN_METEO_FORECAST = "https://api.open-meteo.com/v1/forecast";

/** Serialises one Open-Meteo location block into per-day rows. */
export function parseLocation(location: OpenMeteoLocation, pastDays: number): CellWeather {
  const d = location.daily;
  const at = (key: DailyKey, i: number): number | null => {
    const value = d[key]?.[i];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  };
  const rows: DailyWeather[] = d.time.map((date, i) => ({
    date,
    tmax_c: at("temperature_2m_max", i),
    tmin_c: at("temperature_2m_min", i),
    uv_index_max: at("uv_index_max", i),
    shortwave_mj_m2: at("shortwave_radiation_sum", i),
    sunshine_s: at("sunshine_duration", i) === null ? null : Math.round(at("sunshine_duration", i) as number),
    precipitation_mm: at("precipitation_sum", i),
    precipitation_probability: at("precipitation_probability_max", i),
    wind_max_kmh: at("wind_speed_10m_max", i),
    humidity_mean: at("relative_humidity_2m_mean", i),
    et0_mm: at("et0_fao_evapotranspiration", i),
  }));
  return {
    lat: location.latitude,
    lon: location.longitude,
    timezone: location.timezone,
    actuals: rows.slice(0, pastDays),
    forecast: rows.slice(pastDays),
  };
}

export interface FetchOptions {
  pastDays?: number;
  forecastDays?: number;
  fetchImpl?: typeof fetch;
}

/**
 * Fetches past days and the forecast for up to ~50 cells in one call. Results come
 * back in request order.
 */
export async function fetchCellsWeather(
  cells: Array<{ lat: number; lon: number }>,
  options: FetchOptions = {},
): Promise<CellWeather[]> {
  if (cells.length === 0) return [];
  const pastDays = options.pastDays ?? 2;
  const forecastDays = options.forecastDays ?? 8;
  const doFetch = options.fetchImpl ?? fetch;

  const url = new URL(OPEN_METEO_FORECAST);
  url.searchParams.set("latitude", cells.map((c) => c.lat.toFixed(2)).join(","));
  url.searchParams.set("longitude", cells.map((c) => c.lon.toFixed(2)).join(","));
  url.searchParams.set("daily", DAILY.join(","));
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("past_days", String(pastDays));
  url.searchParams.set("forecast_days", String(forecastDays));

  const response = await doFetch(url, {
    headers: { "User-Agent": "Tuffo/0.1 (https://tuffo.app)" },
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Open-Meteo answered ${response.status}`);
  }
  const body = (await response.json()) as OpenMeteoLocation | OpenMeteoLocation[];
  const locations = Array.isArray(body) ? body : [body];
  if (locations.length !== cells.length) {
    throw new Error(`Open-Meteo returned ${locations.length} locations for ${cells.length} cells`);
  }
  return locations.map((location) => parseLocation(location, pastDays));
}
