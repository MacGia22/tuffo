import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { pastDaysNeeded, refreshCellIfStale, runWeatherJob } from "../job";

const NOW = new Date("2026-09-27T06:00:00Z");
const YESTERDAY = "2026-09-26T06:00:00Z";

type Cell = { id: string; lat: number; lon: number; timezone: string; last_actuals_at: string | null };

/** Minimal stand-in for the parts of supabase-js the job touches. */
function fakeAdmin(cells: Cell[]) {
  const writes: Record<string, unknown[]> = { weather_daily: [], weather_forecast: [], weather_cells: [] };
  const client = {
    from(table: string) {
      return {
        select() {
          return {
            eq(_col: string, value: unknown) {
              return {
                returns: async () => ({ data: cells, error: null }),
                maybeSingle: async () => ({ data: cells.find((c) => c.id === value) ?? null, error: null }),
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

function openMeteoBody(n: number, days = 5) {
  const time = Array.from({ length: days }, (_, i) => `2026-09-${String(10 + i).padStart(2, "0")}`);
  const one = {
    latitude: 0,
    longitude: 0,
    timezone: "UTC",
    daily: {
      time,
      temperature_2m_max: time.map((_, i) => 30 + i),
      uv_index_max: time.map(() => 8),
      precipitation_probability_max: time.map((_, i) => i * 10),
    },
  };
  return Array.from({ length: n }, () => one);
}

describe("pastDaysNeeded", () => {
  it("asks for a month on the first fetch and covers any gap after that", () => {
    expect(pastDaysNeeded(null, NOW.getTime())).toBe(31);
    // A pool moving to a new cell backfills all the history the API has.
    expect(pastDaysNeeded(null, NOW.getTime(), 92)).toBe(92);
    expect(pastDaysNeeded(null, NOW.getTime(), 200)).toBe(92);
    expect(pastDaysNeeded(YESTERDAY, NOW.getTime())).toBe(2);
    expect(pastDaysNeeded("2026-09-17T06:00:00Z", NOW.getTime())).toBe(11);
    expect(pastDaysNeeded("2026-01-01T00:00:00Z", NOW.getTime())).toBe(92);
  });
});

describe("runWeatherJob", () => {
  it("writes actuals and forecast for every active cell and stamps the cells", async () => {
    const { client, writes } = fakeAdmin([
      { id: "27.75,-82.65", lat: 27.75, lon: -82.65, timezone: "America/New_York", last_actuals_at: YESTERDAY },
      { id: "45.00,9.00", lat: 45, lon: 9, timezone: "Europe/Rome", last_actuals_at: YESTERDAY },
    ]);
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      expect(new URL(String(input)).searchParams.get("past_days")).toBe("2");
      return new Response(JSON.stringify(openMeteoBody(2)));
    });
    const result = await runWeatherJob(client, { fetchImpl: fetchImpl as unknown as typeof fetch, now: NOW });

    expect(result).toMatchObject({ cells: 2, batches: 1, failed: 0, actualsWritten: 4, forecastWritten: 6 });
    const actual = writes.weather_daily[0] as Record<string, unknown>;
    expect(actual.cell_id).toBe("27.75,-82.65");
    expect(actual).not.toHaveProperty("precipitation_probability");
    const forecast = writes.weather_forecast[0] as Record<string, unknown>;
    expect(forecast).toHaveProperty("precipitation_probability", 20);
    expect(writes.weather_cells).toHaveLength(1);
  });

  it("backfills new cells in their own batch", async () => {
    const cells: Cell[] = [
      ...Array.from({ length: 40 }, (_, i) => ({ id: `old${i}`, lat: i, lon: i, timezone: "UTC", last_actuals_at: YESTERDAY })),
      { id: "new", lat: 1, lon: 1, timezone: "UTC", last_actuals_at: null },
    ];
    const { client } = fakeAdmin(cells);
    const pastDays: string[] = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      pastDays.push(url.searchParams.get("past_days") ?? "");
      const count = url.searchParams.get("latitude")!.split(",").length;
      return new Response(JSON.stringify(openMeteoBody(count, 40)));
    });
    const result = await runWeatherJob(client, { fetchImpl: fetchImpl as unknown as typeof fetch, now: NOW });
    expect(result.failed).toBe(0);
    // The new cell sorts first and sets the backfill for its batch; the rest follow.
    expect(pastDays).toEqual(["31", "2"]);
  });

  it("keeps going when a batch fails", async () => {
    const cells = Array.from({ length: 45 }, (_, i) => ({ id: `c${i}`, lat: i, lon: i, timezone: "UTC", last_actuals_at: YESTERDAY }));
    const { client } = fakeAdmin(cells);
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call += 1;
      if (call === 1) return new Response("nope", { status: 500 });
      return new Response(JSON.stringify(openMeteoBody(5)));
    });
    const result = await runWeatherJob(client, { fetchImpl: fetchImpl as unknown as typeof fetch, now: NOW });
    expect(result.batches).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.errors[0]).toMatch(/500/);
    expect(result.forecastWritten).toBe(15);
  });

  it("does nothing with no active cells", async () => {
    const { client } = fakeAdmin([]);
    const fetchImpl = vi.fn();
    const result = await runWeatherJob(client, { fetchImpl: fetchImpl as unknown as typeof fetch, now: NOW });
    expect(result.cells).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("refreshCellIfStale", () => {
  it("fetches a stale cell and leaves a fresh one alone", async () => {
    const { client } = fakeAdmin([
      { id: "stale", lat: 1, lon: 1, timezone: "UTC", last_actuals_at: "2026-09-25T00:00:00Z" },
      { id: "fresh", lat: 2, lon: 2, timezone: "UTC", last_actuals_at: "2026-09-27T01:00:00Z" },
    ]);
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(openMeteoBody(1))));
    const opts = { fetchImpl: fetchImpl as unknown as typeof fetch, now: NOW };
    expect(await refreshCellIfStale(client, "stale", opts)).toBe(true);
    expect(await refreshCellIfStale(client, "fresh", opts)).toBe(false);
    expect(await refreshCellIfStale(client, "missing", opts)).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("never throws", async () => {
    const { client } = fakeAdmin([{ id: "x", lat: 1, lon: 1, timezone: "UTC", last_actuals_at: null }]);
    const fetchImpl = vi.fn(async () => {
      throw new Error("offline");
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      refreshCellIfStale(client, "x", { fetchImpl: fetchImpl as unknown as typeof fetch, now: NOW }),
    ).resolves.toBe(false);
    spy.mockRestore();
  });
});
