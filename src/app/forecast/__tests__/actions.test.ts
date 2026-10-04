import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let country: string | null = null;
vi.mock("next/headers", () => ({
  headers: async () => new Headers(country ? { "x-vercel-ip-country": country } : {}),
}));
vi.mock("@/lib/forecast/limits", () => ({ allowPlaceSearch: async () => true }));

import { findForecastPlaces } from "../actions";

// Open-Meteo's answer for "Melbourne", trimmed.
const results = [
  { name: "Melbourne", latitude: -37.814, longitude: 144.963, feature_code: "PPLA", country_code: "AU", country: "Australia", admin1: "Victoria", timezone: "Australia/Melbourne", population: 4917750 },
  { name: "Melbourne", latitude: 28.084, longitude: -80.608, feature_code: "PPL", country_code: "US", country: "United States", admin1: "Florida", timezone: "America/New_York", population: 84678 },
  { name: "Melbourne", latitude: 36.06, longitude: -91.909, feature_code: "PPL", country_code: "US", country: "United States", admin1: "Arkansas", timezone: "America/Chicago", population: 1848 },
  { name: "Melbourne", latitude: 41.94, longitude: -93.103, feature_code: "PPL", country_code: "US", country: "United States", admin1: "Iowa", timezone: "America/Chicago", population: 830 },
];

describe("findForecastPlaces", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ results }), { status: 200 })));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    country = null;
  });

  it("lists Melbourne, Victoria first from an Australian connection", async () => {
    country = "AU";
    const { places } = await findForecastPlaces("Melbourne");
    expect(places[0].label).toBe("Melbourne, Victoria, Australia");
  });

  it("lists Melbourne, FL first from a US connection", async () => {
    country = "US";
    const { places } = await findForecastPlaces("Melbourne");
    expect(places[0].label).toBe("Melbourne, Florida, US");
  });

  it("keeps US places first when the country is unknown", async () => {
    const { places } = await findForecastPlaces("Melbourne");
    expect(places.map((p) => p.country)).toEqual(["US", "US", "US", "AU"]);
  });
});
