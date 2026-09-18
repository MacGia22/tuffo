import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runWeatherJob } from "../job";

/** Minimal stand-in for the parts of supabase-js the job touches. */
function fakeAdmin(cells: Array<{ id: string; lat: number; lon: number; timezone: string }>) {
  const writes: Record<string, unknown[]> = { weather_daily: [], weather_forecast: [], weather_cells: [] };
  const client = {
    from(table: string) {
      return {
        select() {
          return {
            eq() {
              return {
                returns: async () => ({ data: cells, error: null }),
              };
            },
          };
        },
        upsert: async (rows: unknown[]) => {
          writes[table].push(...rows);
          return { error: null };
        },
        update(values: unknown) {
          return {
            in: async (_col: string, ids: string[]) => {
              writes[table].push({ values, ids });
              return { error: null };
            },
          };
        },
      };
    },
  };
  return { client: client as unknown as SupabaseClient, writes };
}

function openMeteoBody(n: number) {
  const one = {
    latitude: 0,
    longitude: 0,
    timezone: "UTC",
    daily: {
      time: ["2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20"],
      temperature_2m_max: [30, 31, 32, 33, 34],
      uv_index_max: [8, 8, 9, 9, 9],
      precipitation_probability_max: [0, 10, 20, 30, 40],
    },
  };
  return Array.from({ length: n }, () => one);
}

describe("runWeatherJob", () => {
  it("writes actuals and forecast for every active cell and stamps the cells", async () => {
    const { client, writes } = fakeAdmin([
      { id: "27.75,-82.65", lat: 27.75, lon: -82.65, timezone: "America/New_York" },
      { id: "45.00,9.00", lat: 45, lon: 9, timezone: "Europe/Rome" },
    ]);
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(openMeteoBody(2))));
    const result = await runWeatherJob(client, { fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(result).toMatchObject({ cells: 2, batches: 1, failed: 0, actualsWritten: 4, forecastWritten: 6 });
    expect(writes.weather_daily).toHaveLength(4);
    expect(writes.weather_forecast).toHaveLength(6);
    const actual = writes.weather_daily[0] as Record<string, unknown>;
    expect(actual.cell_id).toBe("27.75,-82.65");
    expect(actual).not.toHaveProperty("precipitation_probability");
    const forecast = writes.weather_forecast[0] as Record<string, unknown>;
    expect(forecast).toHaveProperty("precipitation_probability", 20);
    expect(writes.weather_cells).toHaveLength(1);
  });

  it("keeps going when a batch fails", async () => {
    const cells = Array.from({ length: 45 }, (_, i) => ({ id: `c${i}`, lat: i, lon: i, timezone: "UTC" }));
    const { client } = fakeAdmin(cells);
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call += 1;
      if (call === 1) return new Response("nope", { status: 500 });
      return new Response(JSON.stringify(openMeteoBody(5)));
    });
    const result = await runWeatherJob(client, { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result.batches).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.errors[0]).toMatch(/500/);
    expect(result.forecastWritten).toBe(15);
  });

  it("does nothing with no active cells", async () => {
    const { client } = fakeAdmin([]);
    const fetchImpl = vi.fn();
    const result = await runWeatherJob(client, { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result.cells).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
