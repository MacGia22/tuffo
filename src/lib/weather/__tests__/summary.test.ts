import { describe, expect, it } from "vitest";
import { localDateRange, summarizeBetween, sunVerdict } from "../summary";

const weather = [
  { date: "2026-09-15", tmax_c: 33, tmin_c: 25, uv_index_max: 9.5, sunshine_s: 39600, precipitation_mm: 0 },
  { date: "2026-09-16", tmax_c: 31, tmin_c: 24, uv_index_max: 7.5, sunshine_s: 28800, precipitation_mm: 12.4 },
  { date: "2026-09-17", tmax_c: 30, tmin_c: 24, uv_index_max: null, sunshine_s: null, precipitation_mm: 3 },
];

describe("summarizeBetween", () => {
  it("computes FC loss per day and weather averages", () => {
    const s = summarizeBetween(
      { taken_at: "2026-09-15T12:00:00Z", fc: 7 },
      { taken_at: "2026-09-17T12:00:00Z", fc: 3 },
      weather,
    );
    expect(s.days).toBe(2);
    expect(s.fcLossPerDay).toBe(2);
    expect(s.avgUvMax).toBe(8.5);
    expect(s.avgTmaxC).toBe(31.3);
    expect(s.sunshineHours).toBe(19);
    expect(s.rainMm).toBe(15.4);
    expect(s.daysWithWeather).toBe(3);
  });

  it("never reports a negative loss and handles missing FC", () => {
    expect(
      summarizeBetween({ taken_at: "2026-09-15T12:00:00Z", fc: 3 }, { taken_at: "2026-09-16T12:00:00Z", fc: 5 }, [])
        .fcLossPerDay,
    ).toBe(0);
    expect(
      summarizeBetween({ taken_at: "2026-09-15T12:00:00Z", fc: null }, { taken_at: "2026-09-16T12:00:00Z", fc: 5 }, [])
        .fcLossPerDay,
    ).toBeNull();
  });

  it("gives local dates for a pool's timezone", () => {
    // 03:00 UTC on the 18th is still the 17th in Florida.
    expect(localDateRange("2026-09-15T12:00:00Z", "2026-09-18T03:00:00Z", "America/New_York")).toEqual({
      from: "2026-09-15",
      to: "2026-09-17",
    });
  });

  it("describes the sun", () => {
    expect(sunVerdict(10)).toBe("very strong sun");
    expect(sunVerdict(5)).toBe("moderate sun");
    expect(sunVerdict(null)).toBe("");
  });
});
