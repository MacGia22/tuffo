import "server-only";

import { unstable_cache } from "next/cache";
import {
  DEFAULT_PRIOR,
  dayDrivers,
  predictLoss,
  REFERENCE_SUNNY_DAY,
  planWeek,
  targetsFor,
  type Coefficients,
  type PlanForecastDay,
} from "@/engine/server";
import { loadPopulationPrior } from "@/lib/model/recompute";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { cellFor } from "@/lib/weather/cells";
import { fetchCellsWeather } from "@/lib/weather/open-meteo";
import type { ForecastInput } from "./params";
import { TYPICAL_CELL_HOURS, TYPICAL_CELL_SIZE, typicalCellPpmPerDay } from "./typical";
import { buildForecastView, type ForecastView, type ForecastWeatherDay } from "./view";

/**
 * The public forecast: a typical pool's week in one weather cell, from the population
 * prior and the 7-day forecast. Anonymous lookups never write weather tables (the
 * nightly job would keep them forever): a cell Tuffo already tracks is read from
 * weather_forecast, any other is fetched from Open-Meteo and cached per cell for 3 hours.
 * Returns display values only.
 */

const DAYS = 7;
const CACHE_SECONDS = 3 * 3600;
/** A stored forecast older than this is not used. */
const STORED_FRESH_HOURS = 30;


export interface ForecastWeather {
  timezone: string;
  days: (ForecastWeatherDay & { sunshineHours: number | null; shortwaveMj: number | null })[];
}

function localDate(now: number, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now));
  } catch {
    return new Date(now).toISOString().slice(0, 10);
  }
}

function n(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const v = Number(value);
  return Number.isFinite(v) ? v : null;
}

/** Open-Meteo, forecast only, cached per cell for 3 hours across instances. */
const fetchCellForecast = unstable_cache(
  async (lat: number, lon: number): Promise<ForecastWeather> => {
    const [cell] = await fetchCellsWeather([{ lat, lon }], { pastDays: 0, forecastDays: DAYS + 1 });
    return {
      timezone: cell.timezone,
      days: cell.forecast.map((d) => ({
        date: d.date,
        uvIndexMax: d.uv_index_max,
        tmaxC: d.tmax_c,
        rainMm: d.precipitation_mm,
        sunshineHours: d.sunshine_s === null ? null : d.sunshine_s / 3600,
        shortwaveMj: d.shortwave_mj_m2,
      })),
    };
  },
  ["forecast-cell-weather-v1"],
  { revalidate: CACHE_SECONDS },
);

/** The stored forecast for a cell Tuffo already tracks, or null. Never throws. */
async function storedForecast(cellId: string, now: number): Promise<ForecastWeather | null> {
  try {
    const admin = createSupabaseAdminClient();
    const { data: cell } = await admin
      .from("weather_cells")
      .select("timezone, last_forecast_at")
      .eq("id", cellId)
      .maybeSingle<{ timezone: string; last_forecast_at: string | null }>();
    if (!cell?.last_forecast_at || now - Date.parse(cell.last_forecast_at) > STORED_FRESH_HOURS * 3_600_000) return null;
    const today = localDate(now, cell.timezone);
    const { data: rows } = await admin
      .from("weather_forecast")
      .select("date, uv_index_max, sunshine_s, shortwave_mj_m2, tmax_c, precipitation_mm")
      .eq("cell_id", cellId)
      .gte("date", today)
      .order("date")
      .limit(DAYS)
      .returns<
        {
          date: string;
          uv_index_max: unknown;
          sunshine_s: unknown;
          shortwave_mj_m2: unknown;
          tmax_c: unknown;
          precipitation_mm: unknown;
        }[]
      >();
    if (!rows || rows.length < DAYS - 1) return null;
    return {
      timezone: cell.timezone,
      days: rows.map((r) => ({
        date: r.date,
        uvIndexMax: n(r.uv_index_max),
        tmaxC: n(r.tmax_c),
        rainMm: n(r.precipitation_mm),
        sunshineHours: n(r.sunshine_s) === null ? null : (n(r.sunshine_s) as number) / 3600,
        shortwaveMj: n(r.shortwave_mj_m2),
      })),
    };
  } catch (error) {
    console.error(`[forecast] stored weather: ${error instanceof Error ? error.message : "error"}`);
    return null;
  }
}

export async function loadForecastWeather(lat: number, lon: number, now = Date.now()): Promise<ForecastWeather> {
  const cell = cellFor(lat, lon);
  const stored = await storedForecast(cell.id, now);
  if (stored) return stored;
  const fetched = await fetchCellForecast(cell.lat, cell.lon);
  // The cache can hold yesterday: start from today in the cell's time zone.
  const today = localDate(now, fetched.timezone);
  return { ...fetched, days: fetched.days.filter((d) => d.date >= today).slice(0, DAYS) };
}

/** The population prior, cached for an hour; the default prior when it cannot be read. */
const cachedPriorMean = unstable_cache(
  async (): Promise<Coefficients> => (await loadPopulationPrior(createSupabaseAdminClient())).mean,
  ["forecast-population-prior-v1"],
  { revalidate: 3600 },
);

async function priorMean(): Promise<Coefficients> {
  try {
    return await cachedPriorMean();
  } catch (error) {
    console.error(`[forecast] prior: ${error instanceof Error ? error.message : "error"}`);
    return DEFAULT_PRIOR.mean;
  }
}

export interface ForecastResult {
  view: ForecastView;
  timezone: string;
}

/** The week for a typical pool. Throws when the weather cannot be had. */
export async function buildPublicForecast(input: ForecastInput, now = Date.now()): Promise<ForecastResult | null> {
  const [weather, coefficients] = await Promise.all([loadForecastWeather(input.lat, input.lon, now), priorMean()]);
  if (weather.days.length === 0) return null;
  const swg = input.sanitizer === "salt";
  const days: PlanForecastDay[] = weather.days.map((d) => ({
    date: d.date,
    weather: {
      uvIndexMax: d.uvIndexMax,
      sunshineHours: d.sunshineHours,
      shortwaveMj: d.shortwaveMj,
      tmaxC: d.tmaxC,
      rainMm: d.rainMm,
    },
  }));
  const fcStart = targetsFor({ swg, surface: "plaster", cya: input.cya }).fc.targetLow;
  const plan = planWeek({
    coefficients,
    pairs: 0,
    pool: {
      volumeL: input.volumeL,
      surfaceAreaM2: null,
      swg,
      covered: false,
      surface: "plaster",
      cellPpmPerDay: swg ? typicalCellPpmPerDay(input.volumeL) : null,
    },
    water: { fc: fcStart, cya: input.cya, ch: null, salt: null },
    days,
  });
  if (!plan) return null;

  // Share of the week's use that comes from sun, for the one-line "why".
  let sun = 0;
  let total = 0;
  for (const d of days) {
    const drivers = dayDrivers(d.weather, { cya: input.cya, covered: false, heavyUse: 0 });
    if (!drivers) continue;
    sun += coefficients.sun * drivers.sun;
    total += Math.max(0, coefficients.base + coefficients.sun * drivers.sun + coefficients.heat * drivers.heat + coefficients.rain * drivers.rain);
  }

  const summerDay = dayDrivers(REFERENCE_SUNNY_DAY, { cya: input.cya, covered: false, heavyUse: 0 });
  const view = buildForecastView({
    input,
    plan,
    weather: weather.days,
    sunShare: total > 0 ? sun / total : 0,
    summerDayPpm: summerDay ? predictLoss(coefficients, summerDay) : 0,
    cellText: `a typical cell rated for ${TYPICAL_CELL_SIZE} times your pool, running ${TYPICAL_CELL_HOURS} hours a day`,
  });
  return { view, timezone: weather.timezone };
}
