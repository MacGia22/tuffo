import { describe, expect, it } from "vitest";
import { prefillFromForecast } from "../prefill";

describe("prefillFromForecast", () => {
  it("fills the new-pool form from the forecast's link", () => {
    expect(
      prefillFromForecast({
        place: "Tampa, Florida, US",
        lat: "27.96",
        lon: "-82.47",
        tz: "America/New_York",
        v: "56781",
        cya: "50",
        s: "salt",
        u: "us",
      }),
    ).toEqual({
      units: "us",
      cya: 50,
      fields: {
        units: "us",
        query: "Tampa, Florida, US",
        volume: "15000",
        sanitizer: "swg",
        lat: "27.96",
        lon: "-82.47",
        timezone: "America/New_York",
        place_label: "Tampa, Florida, US",
      },
    });
  });

  it("leaves out what does not check: no place, bad time zone, volume or CYA", () => {
    expect(prefillFromForecast({})).toBeNull();
    const p = prefillFromForecast({ place: "Bari, Italy", lat: "41.13", lon: "16.86", tz: "Mars/Base", v: "5", cya: "400", u: "metric" });
    expect(p).toEqual({ units: "metric", cya: null, fields: { units: "metric", query: "Bari, Italy", sanitizer: "chlorine" } });
  });

  it("shows liters to the nearest 10 for metric", () => {
    expect(prefillFromForecast({ place: "Bari, Italy", v: "57004", u: "metric" })?.fields.volume).toBe("57000");
  });
});
