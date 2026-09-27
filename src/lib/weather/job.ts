import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchCellsWeather, type DailyWeather } from "./open-meteo";

/**
 * Weather refresh for cells: store the last days as actuals and the coming week as
 * forecast. The nightly job runs it for every active cell; pool creation and page
 * views run it for one stale cell. Runs with the service key (weather tables are
 * written only by the server). Cells are fetched in batches; one failing batch does
 * not stop the others.
 */

export interface WeatherJobResult {
  cells: number;
  batches: number;
  failed: number;
  actualsWritten: number;
  forecastWritten: number;
  errors: string[];
}

export interface CellRow {
  id: string;
  lat: number;
  lon: number;
  timezone: string;
  last_actuals_at: string | null;
}

const BATCH = 40;
/** Open-Meteo's forecast API returns up to 92 past days. */
const MAX_PAST_DAYS = 92;
/** A cell that has never been fetched gets a month of history, enough for the trend chart. */
const FIRST_FETCH_DAYS = 31;
/** A cell refreshed within this window is left alone by page views. */
export const FRESH_HOURS = 20;

const DAY_MS = 86_400_000;

/** Past days to request so nothing is missed since the cell's last successful fetch. */
export function pastDaysNeeded(lastActualsAt: string | null, now: number): number {
  if (!lastActualsAt) return FIRST_FETCH_DAYS;
  const days = Math.ceil((now - Date.parse(lastActualsAt)) / DAY_MS) + 1;
  return Math.min(MAX_PAST_DAYS, Math.max(2, days));
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function rowsFor(cellId: string, days: DailyWeather[], fetchedAt: string) {
  return days.map((d) => ({ cell_id: cellId, ...d, fetched_at: fetchedAt }));
}

async function refreshBatch(
  admin: SupabaseClient,
  batch: CellRow[],
  pastDays: number,
  fetchedAt: string,
  fetchImpl?: typeof fetch,
): Promise<{ actuals: number; forecast: number }> {
  const weather = await fetchCellsWeather(
    batch.map((c) => ({ lat: Number(c.lat), lon: Number(c.lon) })),
    { fetchImpl, pastDays },
  );

  const forecast = batch.flatMap((cell, i) => rowsFor(cell.id, weather[i].forecast, fetchedAt));
  // weather_daily has no probability column.
  const actualRows = batch.flatMap((cell, i) =>
    rowsFor(cell.id, weather[i].actuals, fetchedAt).map((row) => {
      const { precipitation_probability, ...rest } = row;
      void precipitation_probability;
      return rest;
    }),
  );

  const [{ error: aErr }, { error: fErr }] = await Promise.all([
    actualRows.length
      ? admin.from("weather_daily").upsert(actualRows, { onConflict: "cell_id,date" })
      : Promise.resolve({ error: null }),
    forecast.length
      ? admin.from("weather_forecast").upsert(forecast, { onConflict: "cell_id,date" })
      : Promise.resolve({ error: null }),
  ]);
  if (aErr) throw new Error(`weather_daily upsert: ${aErr.message}`);
  if (fErr) throw new Error(`weather_forecast upsert: ${fErr.message}`);

  const { error: cErr } = await admin
    .from("weather_cells")
    .update({ last_actuals_at: fetchedAt, last_forecast_at: fetchedAt })
    .in(
      "id",
      batch.map((c) => c.id),
    );
  if (cErr) throw new Error(`weather_cells update: ${cErr.message}`);

  return { actuals: actualRows.length, forecast: forecast.length };
}

/** Refreshes the given cells, grouping those that need a long backfill together. */
export async function refreshCells(
  admin: SupabaseClient,
  cells: CellRow[],
  options: { fetchImpl?: typeof fetch; now?: Date } = {},
): Promise<WeatherJobResult> {
  const result: WeatherJobResult = {
    cells: cells.length,
    batches: 0,
    failed: 0,
    actualsWritten: 0,
    forecastWritten: 0,
    errors: [],
  };
  const now = options.now ?? new Date();
  const fetchedAt = now.toISOString();

  const withNeed = cells
    .map((cell) => ({ cell, need: pastDaysNeeded(cell.last_actuals_at, now.getTime()) }))
    .sort((a, b) => b.need - a.need);

  for (const batch of chunk(withNeed, BATCH)) {
    result.batches += 1;
    try {
      const pastDays = batch[0].need; // the largest need in this batch
      const written = await refreshBatch(
        admin,
        batch.map((b) => b.cell),
        pastDays,
        fetchedAt,
        options.fetchImpl,
      );
      result.actualsWritten += written.actuals;
      result.forecastWritten += written.forecast;
    } catch (err) {
      result.failed += 1;
      result.errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  return result;
}

/** The nightly job: every active cell. */
export async function runWeatherJob(
  admin: SupabaseClient,
  options: { fetchImpl?: typeof fetch; now?: Date } = {},
): Promise<WeatherJobResult> {
  const { data: cells, error } = await admin
    .from("weather_cells")
    .select("id, lat, lon, timezone, last_actuals_at")
    .eq("active", true)
    .returns<CellRow[]>();
  if (error) throw new Error(`could not list weather cells: ${error.message}`);
  return refreshCells(admin, cells, options);
}

/**
 * One cell, only when it has not been refreshed recently. Used right after a pool is
 * created and in the background of page views, so weather does not depend on the
 * nightly job alone. Failures are logged, never thrown.
 */
export async function refreshCellIfStale(
  admin: SupabaseClient,
  cellId: string,
  options: { fetchImpl?: typeof fetch; now?: Date } = {},
): Promise<boolean> {
  try {
    const { data: cell, error } = await admin
      .from("weather_cells")
      .select("id, lat, lon, timezone, last_actuals_at")
      .eq("id", cellId)
      .maybeSingle<CellRow>();
    if (error || !cell) return false;
    const now = (options.now ?? new Date()).getTime();
    if (cell.last_actuals_at && now - Date.parse(cell.last_actuals_at) < FRESH_HOURS * 3_600_000) return false;
    const result = await refreshCells(admin, [cell], options);
    if (result.failed) console.error(`[weather] refresh ${cellId} failed: ${result.errors.join("; ").slice(0, 300)}`);
    return result.failed === 0;
  } catch (err) {
    console.error(`[weather] refresh ${cellId} failed: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}
