import { describe, expect, it } from "vitest";
import { buildTrend, fcForDay, parseRange, rangeStart, trendWindow, xFor } from "../trends";

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

  it("marks days whose rain is the owner's own figure", () => {
    const trend = buildTrend({
      timeZone: TZ,
      now,
      units: "us",
      readings: [],
      doses: [],
      weather: [
        { date: "2026-09-25", uv_index_max: 8, precipitation_mm: 12.7, ownRain: true },
        { date: "2026-09-26", uv_index_max: 9, precipitation_mm: 50.8 },
      ],
      fcBand: { low: 5, high: 7 },
      phBand: { low: 7.2, high: 7.8 },
    });
    expect(trend.days.find((d) => d.date === "2026-09-25")).toMatchObject({ rainMm: 12.7, ownRain: true });
    expect(trend.days.find((d) => d.date === "2026-09-26")).toMatchObject({ rainMm: 50.8, ownRain: false });
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

  it("draws a salt plan smoothly from the estimate at now", () => {
    const trend = buildTrend({
      timeZone: TZ,
      now,
      units: "us",
      readings: [{ taken_at: "2026-09-25T12:00:00Z", fc: 8, ph: 7.6 }],
      doses: [],
      weather: [],
      fcBand: { low: 3, high: 5 },
      phBand: { low: 7.2, high: 7.8 },
      estimate: [
        { at: "2026-09-25T12:00:00Z", fc: 8 },
        { at: "2026-09-26T04:00:00Z", fc: 7.2 },
        { at: "2026-09-27T16:00:00Z", fc: 6 },
      ],
      expected: [{ at: "2026-09-25T12:00:00Z", expected: 9.1, measured: 8 }],
      plan: {
        continuous: true,
        days: [
          { date: "2026-09-27", fcAfterAdd: 9, fcEnd: 6.4, add: null, uv_index_max: 9, precipitation_mm: 0 },
          { date: "2026-09-28", fcAfterAdd: 9.2, fcEnd: 6.8, add: null, uv_index_max: 9, precipitation_mm: 0 },
        ],
      },
    });
    const today = trend.days.findIndex((d) => d.date === "2026-09-27");
    // From the estimate at now (6), straight to each day's end: no daily jump for a cell.
    expect(trend.forecast.map((p) => p.fc)).toEqual([6, 6.4, 6.8]);
    expect(trend.forecast.map((p) => p.x).slice(1)).toEqual([today + 1, today + 2]);
    expect(trend.estimate.map((p) => p.fc)).toEqual([8, 7.2, 6]);
    expect(trend.estimate[2].x).toBeCloseTo(trend.forecastFrom!, 5);
    expect(trend.expected).toHaveLength(1);
    expect(trend.expected[0]).toMatchObject({ expected: 9.1, measured: 8 });
  });

  it("draws the forecast's days ahead without a plan, with chance of rain and highs", () => {
    const trend = buildTrend({
      timeZone: TZ,
      start: "2026-09-20",
      now,
      units: "us",
      readings: [],
      doses: [],
      weather: [{ date: "2026-09-26", uv_index_max: 8, precipitation_mm: 0, tmax_c: 31 }],
      forecastWeather: [
        { date: "2026-09-27", uv_index_max: 7.4, precipitation_mm: 2, precipitation_probability: 40, tmax_c: 32 },
        { date: "2026-09-28", uv_index_max: 6, precipitation_mm: 20, precipitation_probability: 52, tmax_c: 30 },
        { date: "2026-10-09", uv_index_max: 6, precipitation_mm: 0, precipitation_probability: 0, tmax_c: 30 },
      ],
      fcBand: { low: 3, high: 5 },
      fcMin: 2,
      phBand: { low: 7.2, high: 7.8 },
    });
    // Sep 20 to 27 behind and today, then at most 7 days ahead.
    expect(trend.days).toHaveLength(8 + 7);
    expect(trend.todayIndex).toBe(7);
    expect(trend.days[6]).toMatchObject({ kind: "past", weekday: "Saturday", tmaxC: 31, rainChance: null });
    expect(trend.days[7]).toMatchObject({ kind: "today", uv: 7.4, rainChance: 40, tmaxC: 32 });
    expect(trend.days[8]).toMatchObject({ kind: "forecast", rainMm: 20, rainChance: 52 });
    expect(trend.forecastFrom).not.toBeNull();
    expect(trend.forecast).toEqual([]);
    expect(trend.fcMin).toBe(2);
  });

  it("widens the estimate with the days since the test", () => {
    const trend = buildTrend({
      timeZone: TZ,
      now,
      units: "us",
      readings: [{ taken_at: "2026-09-24T16:00:00Z", fc: 6, ph: 7.6 }],
      doses: [],
      weather: [],
      fcBand: { low: 3, high: 5 },
      phBand: { low: 7.2, high: 7.8 },
      estimate: [
        { at: "2026-09-24T16:00:00Z", fc: 6 },
        { at: "2026-09-25T16:00:00Z", fc: 5 },
        { at: "2026-09-27T16:00:00Z", fc: 3.4 },
      ],
    });
    // ±0.1 ppm a day without the pool's own model.
    expect(trend.estimate.map((p) => p.spread)).toEqual([0, 0.1, 0.3]);
    const today = trend.todayIndex;
    expect(fcForDay(trend, today - 3)).toEqual({ value: 6, kind: "measured" });
    expect(fcForDay(trend, today)).toEqual({ value: 3.4, kind: "estimated" });
    expect(fcForDay(trend, today - 5)).toBeNull();
    const own = buildTrend({ ...{ timeZone: TZ, now, units: "us" as const, readings: [], doses: [], weather: [] }, fcBand: { low: 3, high: 5 }, phBand: { low: 7.2, high: 7.8 }, estimate: [{ at: "2026-09-24T16:00:00Z", fc: 6 }, { at: "2026-09-26T16:00:00Z", fc: 4 }], estimateSpreadPerDay: 0.4 });
    expect(own.estimate.map((p) => p.spread)).toEqual([0, 0.8]);
  });

  it("starts a salt plan line at the plan's starting FC when there is no estimate", () => {
    const trend = buildTrend({
      timeZone: TZ,
      now,
      units: "us",
      readings: [{ taken_at: "2026-09-27T12:00:00Z", fc: 4, ph: 7.6 }],
      doses: [],
      weather: [],
      fcBand: { low: 4, high: 6 },
      phBand: { low: 7.2, high: 7.8 },
      plan: {
        continuous: true,
        fcStart: 4,
        days: [{ date: "2026-09-27", fcAfterAdd: 6.28, fcEnd: 4.6, add: null, uv_index_max: 9, precipitation_mm: 0 }],
      },
    });
    expect(trend.forecast[0].fc).toBe(4);
  });

  it("has no forecast without a plan", () => {
    const trend = buildTrend({ timeZone: TZ, now, units: "us", readings: [], doses: [], weather: [], fcBand: { low: 5, high: 7 }, phBand: { low: 7.2, high: 7.8 } });
    expect(trend.forecast).toEqual([]);
    expect(trend.forecastFrom).toBeNull();
    expect(trend.days.every((d) => !d.forecast)).toBe(true);
  });
});

describe("ranges", () => {
  it("reads the range and finds its first day", () => {
    expect(parseRange("90")).toBe("90");
    expect(parseRange("x")).toBe("2w");
    expect(parseRange("14")).toBe("2w");
    // Two weeks: the week behind, today, and (in buildTrend) the week ahead.
    expect(rangeStart("2w", now, TZ, null)).toBe("2026-09-20");
    expect(rangeStart("90", now, TZ, null)).toBe("2026-06-30");
    // Season: from the first test this year, or January 1.
    expect(rangeStart("season", now, TZ, "2026-04-12T14:00:00Z")).toBe("2026-04-12");
    expect(rangeStart("season", now, TZ, null)).toBe("2026-01-01");
    // Early in January: still two weeks.
    expect(rangeStart("season", Date.parse("2026-01-03T18:00:00Z"), TZ, null)).toBe("2025-12-21");
  });

  it("uses a chosen start in the window, capped to a year", () => {
    expect(trendWindow(null, now, TZ, "2026-06-30")).toEqual({ start: "2026-06-30", end: "2026-09-27" });
    expect(trendWindow(null, now, TZ, "2024-01-01").start).toBe("2025-09-27");
  });
});
