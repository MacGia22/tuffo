import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchCellsWeather, type DailyWeather } from "./open-meteo";

/**
 * The nightly weather job: for every active cell, store the last days as actuals
 * and the coming week as forecast. Runs with the service key (weather tables are
 * written only by jobs). Cells are fetched in batches; one failing batch does not
 * stop the others.
 */

export interface WeatherJobResult {
  cells: number;
  batches: number;
  failed: number;
  actualsWritten: number;
  forecastWritten: number;
  errors: string[];
}

interface CellRow {
  id: string;
  lat: number;
  lon: number;
  timezone: string;
}

const BATCH = 40;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function rowsFor(cellId: string, days: DailyWeather[], fetchedAt: string) {
  return days.map((d) => ({ cell_id: cellId, ...d, fetched_at: fetchedAt }));
}

export async function runWeatherJob(
  admin: SupabaseClient,
  options: { fetchImpl?: typeof fetch; now?: Date } = {},
): Promise<WeatherJobResult> {
  const result: WeatherJobResult = { cells: 0, batches: 0, failed: 0, actualsWritten: 0, forecastWritten: 0, errors: [] };
  const fetchedAt = (options.now ?? new Date()).toISOString();

  const { data: cells, error } = await admin
    .from("weather_cells")
    .select("id, lat, lon, timezone")
    .eq("active", true)
    .returns<CellRow[]>();
  if (error) throw new Error(`could not list weather cells: ${error.message}`);
  result.cells = cells.length;

  for (const batch of chunk(cells, BATCH)) {
    result.batches += 1;
    try {
      const weather = await fetchCellsWeather(
        batch.map((c) => ({ lat: Number(c.lat), lon: Number(c.lon) })),
        { fetchImpl: options.fetchImpl },
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

      result.actualsWritten += actualRows.length;
      result.forecastWritten += forecast.length;

      const { error: cErr } = await admin
        .from("weather_cells")
        .update({ last_actuals_at: fetchedAt, last_forecast_at: fetchedAt })
        .in(
          "id",
          batch.map((c) => c.id),
        );
      if (cErr) throw new Error(`weather_cells update: ${cErr.message}`);
    } catch (err) {
      result.failed += 1;
      result.errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  return result;
}
