import { describe, expect, it, vi } from "vitest";
import { fetchCellsWeather, parseLocation } from "../open-meteo";

const location = {
  latitude: 27.75,
  longitude: -82.65,
  timezone: "America/New_York",
  daily: {
    time: ["2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19"],
    temperature_2m_max: [33.1, 32.4, 31.0, 30.2],
    temperature_2m_min: [25.0, 24.6, 24.0, 23.9],
    uv_index_max: [9.5, 8.1, 7.0, 6.4],
    shortwave_radiation_sum: [24.1, 20.3, 18.0, 15.5],
    sunshine_duration: [39600.4, 32400, 28800, 21600],
    precipitation_sum: [0, 12.4, 3.1, 0],
    precipitation_probability_max: [10, 80, 60, 20],
    wind_speed_10m_max: [18.2, 25.9, 20.0, 15.1],
    relative_humidity_2m_mean: [70, 78, 75, 72],
    et0_fao_evapotranspiration: [5.8, 4.1, 3.9, 3.5],
  },
};

describe("parseLocation", () => {
  it("splits past days from the forecast and rounds sunshine to seconds", () => {
    const cell = parseLocation(location, 2);
    expect(cell.actuals.map((d) => d.date)).toEqual(["2026-09-16", "2026-09-17"]);
    expect(cell.forecast.map((d) => d.date)).toEqual(["2026-09-18", "2026-09-19"]);
    expect(cell.actuals[0]).toMatchObject({ tmax_c: 33.1, uv_index_max: 9.5, sunshine_s: 39600, precipitation_mm: 0 });
    expect(cell.forecast[1].precipitation_probability).toBe(20);
  });

  it("tolerates missing series", () => {
    const cell = parseLocation({ ...location, daily: { time: ["2026-09-18"], uv_index_max: [null] } }, 0);
    expect(cell.forecast[0].uv_index_max).toBeNull();
    expect(cell.forecast[0].tmax_c).toBeNull();
  });
});

describe("fetchCellsWeather", () => {
  it("asks for every cell in one request and maps results in order", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      expect(url.searchParams.get("latitude")).toBe("27.75,28.05");
      expect(url.searchParams.get("longitude")).toBe("-82.65,-82.40");
      expect(url.searchParams.get("past_days")).toBe("2");
      expect(url.searchParams.get("timezone")).toBe("auto");
      return new Response(JSON.stringify([location, { ...location, latitude: 28.05, longitude: -82.4 }]), {
        headers: { "content-type": "application/json" },
      });
    });
    const cells = await fetchCellsWeather(
      [
        { lat: 27.75, lon: -82.65 },
        { lat: 28.05, lon: -82.4 },
      ],
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(cells[1].lat).toBe(28.05);
    expect(cells[0].actuals).toHaveLength(2);
    expect(cells[0].forecast).toHaveLength(2);
  });

  it("fails loudly when the count does not match", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify([location])));
    await expect(
      fetchCellsWeather(
        [
          { lat: 1, lon: 1 },
          { lat: 2, lon: 2 },
        ],
        { fetchImpl: fetchImpl as unknown as typeof fetch },
      ),
    ).rejects.toThrow(/returned 1 locations for 2 cells/);
  });
});
