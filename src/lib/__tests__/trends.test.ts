import { describe, expect, it } from "vitest";
import { buildTrend, trendWindow, xFor } from "../trends";

const TZ = "America/New_York";
const now = Date.parse("2026-09-27T16:00:00Z"); // noon in Florida

describe("trendWindow", () => {
  it("shows two weeks when the first test is recent", () => {
    expect(trendWindow("2026-09-25T12:00:00Z", now, TZ)).toEqual({ start: "2026-09-14", end: "2026-09-27" });
    expect(trendWindow(null, now, TZ)).toEqual({ start: "2026-09-14", end: "2026-09-27" });
  });

  it("reaches back to the first test, up to a month", () => {
    expect(trendWindow("2026-09-05T12:00:00Z", now, TZ)).toEqual({ start: "2026-09-05", end: "2026-09-27" });
    expect(trendWindow("2026-07-01T12:00:00Z", now, TZ)).toEqual({ start: "2026-08-29", end: "2026-09-27" });
  });

  it("uses the pool's calendar, not UTC", () => {
    // 01:00 UTC on the 28th is still the evening of the 27th in Florida.
    expect(trendWindow(null, Date.parse("2026-09-28T01:00:00Z"), TZ).end).toBe("2026-09-27");
  });
});

describe("xFor", () => {
  it("measures days from the window start in local time", () => {
    // 18:00 local on the 15th (22:00 UTC) = day 1 + 0.75.
    expect(xFor("2026-09-15T22:00:00Z", "2026-09-14", TZ)).toBeCloseTo(1.75, 5);
  });
});

describe("buildTrend", () => {
  it("places tests, doses and weather on the window", () => {
    const trend = buildTrend({
      timeZone: TZ,
      now,
      units: "us",
      readings: [
        { taken_at: "2026-09-26T12:00:00Z", fc: 3, ph: 7.8 },
        { taken_at: "2026-09-20T12:00:00Z", fc: 6, ph: 7.5 },
        { taken_at: "2026-08-01T12:00:00Z", fc: 9, ph: 7.2 }, // outside a month: dropped
        { taken_at: "2026-09-22T12:00:00Z", fc: null, ph: null }, // nothing to plot
      ],
      doses: [{ added_at: "2026-09-26T13:00:00Z", label: "2.5 qt liquid chlorine" }],
      weather: [{ date: "2026-09-26", uv_index_max: 9.1, precipitation_mm: 12 }],
      fcBand: { low: 5, high: 7 },
      phBand: { low: 7.2, high: 7.8 },
    });
    expect(trend.days).toHaveLength(30);
    expect(trend.days[0].date).toBe("2026-08-29");
    expect(trend.points.map((p) => p.fc)).toEqual([6, 3]);
    expect(trend.doses).toHaveLength(1);
    expect(trend.doses[0].x).toBeGreaterThan(trend.points[1].x);
    const sep26 = trend.days.find((d) => d.date === "2026-09-26");
    expect(sep26).toMatchObject({ uv: 9.1, rainMm: 12, label: "Sep 26" });
    expect(trend.hasWeather).toBe(true);
  });

  it("adds the plan's days ahead and its predicted free chlorine line", () => {
    const trend = buildTrend({
      timeZone: TZ,
      now,
      units: "us",
      readings: [{ taken_at: "2026-09-26T12:00:00Z", fc: 3, ph: 7.8 }],
      doses: [],
      weather: [],
      fcBand: { low: 5, high: 7 },
      phBand: { low: 7.2, high: 7.8 },
      plan: {
        days: [
          { date: "2026-09-27", fcAfterAdd: 7, fcEnd: 4.6, add: "1 qt of liquid chlorine", uv_index_max: 9, precipitation_mm: 0 },
          { date: "2026-09-28", fcAfterAdd: 6.9, fcEnd: 4.5, add: "1 qt of liquid chlorine", uv_index_max: 3, precipitation_mm: 51 },
          { date: "2026-09-26", fcAfterAdd: 1, fcEnd: 1, add: null, uv_index_max: 0, precipitation_mm: 0 }, // past: ignored
        ],
      },
    });
    const today = trend.days.findIndex((d) => d.date === "2026-09-27");
    expect(trend.days).toHaveLength(today + 2);
    expect(trend.days[today]).toMatchObject({ forecast: false, plan: { fcEnd: 4.6, add: "1 qt of liquid chlorine" } });
    expect(trend.days[today + 1]).toMatchObject({ date: "2026-09-28", forecast: true, uv: 3, rainMm: 51 });
    // After today's addition (from now), end of today, after tomorrow's, end of tomorrow.
    expect(trend.forecast.map((p) => p.fc)).toEqual([7, 4.6, 6.9, 4.5]);
    expect(trend.forecast[0].x).toBeCloseTo(trend.forecastFrom!, 5);
    expect(trend.forecast.map((p) => p.x).slice(1)).toEqual([today + 1, today + 1, today + 2]);
  });

  it("has no forecast without a plan", () => {
    const trend = buildTrend({ timeZone: TZ, now, units: "us", readings: [], doses: [], weather: [], fcBand: { low: 5, high: 7 }, phBand: { low: 7.2, high: 7.8 } });
    expect(trend.forecast).toEqual([]);
    expect(trend.forecastFrom).toBeNull();
    expect(trend.days.every((d) => !d.forecast)).toBe(true);
  });
});
