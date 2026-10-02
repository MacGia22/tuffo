import { describe, expect, it } from "vitest";
import { effectsOf, GRAMS_PER_POUND } from "@/engine/server";
import { estimateFcSeries, expectationsAtTests, typicalMiss } from "../estimate";
import type { ModelPool } from "../observations";

// 1 ppm a day whatever the weather: easy numbers to follow.
const flat = { base: 1, sun: 0, heat: 0, rain: 0, use: 0 };
const pool: ModelPool = { volumeL: 50_000, sanitizer: "chlorine", covered: false, swgCellLbPerDay: null, timezone: "UTC" };
const base = { pool, coefficients: flat, readings: [], doses: [], events: [], weather: [] };

describe("estimateFcSeries", () => {
  it("takes the daily use off, with a point at each midnight", () => {
    const s = estimateFcSeries({ ...base, start: { at: "2026-09-20T12:00:00Z", fc: 5 }, end: "2026-09-22T12:00:00Z" })!;
    expect(s.map((p) => [p.at.slice(0, 16), p.fc])).toEqual([
      ["2026-09-20T12:00", 5],
      ["2026-09-21T00:00", 4.5],
      ["2026-09-22T00:00", 3.5],
      ["2026-09-22T12:00", 3],
    ]);
  });

  it("adds a logged dose as a step", () => {
    const amount = 1000; // ml of 12.5% liquid chlorine
    const ppm = effectsOf("liquid-chlorine-12.5", amount, 50_000).fc!;
    const s = estimateFcSeries({
      ...base,
      doses: [{ added_at: "2026-09-21T12:00:00Z", product_id: "liquid-chlorine-12.5", amount }],
      start: { at: "2026-09-21T00:00:00Z", fc: 3 },
      end: "2026-09-22T00:00:00Z",
    })!;
    // 3 − 0.5 = 2.5 at noon, then + the dose, then − 0.5 by midnight.
    expect(s[1].fc).toBe(2.5);
    expect(s[2].fc).toBeCloseTo(2.5 + ppm, 2);
    expect(s[3].fc).toBeCloseTo(2 + ppm, 2);
  });

  it("counts what the salt cell made at the setting and pump hours in force", () => {
    // 1.4 lb/day in 50,000 L = 12.70 ppm/day at 100%; 50% for 12 h a day = 3.17 ppm/day.
    const salt: ModelPool = { ...pool, sanitizer: "swg", swgCellLbPerDay: 1.4 };
    const rated = (1.4 * GRAMS_PER_POUND * 1000) / 50_000;
    const s = estimateFcSeries({
      ...base,
      pool: salt,
      events: [{ occurred_at: "2026-09-01T00:00:00Z", kind: "cell_setting", value: 50 }],
      pumpSchedules: [{ effective_from: "2026-09-01T00:00:00Z", cell_hours: 12 }],
      start: { at: "2026-09-20T00:00:00Z", fc: 5 },
      end: "2026-09-22T00:00:00Z",
    })!;
    const perDay = rated * 0.5 * 0.5 - 1;
    expect(s[s.length - 1].fc).toBeCloseTo(5 + 2 * perDay, 1);
  });

  it("gives up where it cannot know", () => {
    const salt: ModelPool = { ...pool, sanitizer: "swg", swgCellLbPerDay: 1.4 };
    // No cell setting logged yet.
    expect(estimateFcSeries({ ...base, pool: salt, start: { at: "2026-09-20T00:00:00Z", fc: 5 }, end: "2026-09-21T00:00:00Z" })).toBeNull();
    // A refill in between.
    expect(
      estimateFcSeries({
        ...base,
        events: [{ occurred_at: "2026-09-20T06:00:00Z", kind: "refill" }],
        start: { at: "2026-09-20T00:00:00Z", fc: 5 },
        end: "2026-09-21T00:00:00Z",
      }),
    ).toBeNull();
    // One logged with the next test came after it: the stretch up to that test still counts.
    expect(
      estimateFcSeries({
        ...base,
        events: [{ occurred_at: "2026-09-21T00:00:00Z", kind: "refill" }],
        start: { at: "2026-09-20T00:00:00Z", fc: 5 },
        end: "2026-09-21T00:00:00Z",
      }),
    ).not.toBeNull();
  });

  it("never goes below zero and stops after ten days", () => {
    const s = estimateFcSeries({ ...base, start: { at: "2026-09-01T00:00:00Z", fc: 3 }, end: "2026-09-30T00:00:00Z" })!;
    expect(s[s.length - 1].at.slice(0, 10)).toBe("2026-09-11");
    expect(Math.min(...s.map((p) => p.fc))).toBe(0);
  });
});

describe("expectationsAtTests", () => {
  it("compares each test with the estimate from the one before", () => {
    const out = expectationsAtTests(base, [
      { at: "2026-09-20T12:00:00Z", fc: 6 },
      { at: "2026-09-22T12:00:00Z", fc: 3.5 },
      { at: "2026-09-23T12:00:00Z", fc: 3 },
    ]);
    expect(out).toEqual([
      { at: "2026-09-22T12:00:00Z", expected: 4, measured: 3.5 },
      { at: "2026-09-23T12:00:00Z", expected: 2.5, measured: 3 },
    ]);
    expect(typicalMiss(out)).toEqual({ ppm: 0.5, count: 2 });
  });
});

describe("estimateFcSeries edges", () => {
  it("puts a dose logged at the test's own moment on top of the test", () => {
    const amount = 1000;
    const ppm = effectsOf("liquid-chlorine-12.5", amount, 50_000).fc!;
    const s = estimateFcSeries({
      ...base,
      doses: [{ added_at: "2026-09-21T00:00:00Z", product_id: "liquid-chlorine-12.5", amount }],
      start: { at: "2026-09-21T00:00:00Z", fc: 3 },
      end: "2026-09-22T00:00:00Z",
    })!;
    // 3, then + the dose at the test, then − 1 over the day.
    expect(s.map((p) => p.fc)).toEqual([3, Math.round((3 + ppm) * 100) / 100, Math.round((2 + ppm) * 100) / 100]);
  });

  it("takes a heavy-use event off whole, when it happens", () => {
    // 1 ppm a day plus 1.5 per event: a party at 19:00 after an 18:00 test.
    const busy = { ...flat, use: 1.5 };
    const s = estimateFcSeries({
      ...base,
      coefficients: busy,
      events: [{ occurred_at: "2026-09-21T19:00:00Z", kind: "heavy_use", value: null }],
      start: { at: "2026-09-21T18:00:00Z", fc: 6 },
      end: "2026-09-22T18:00:00Z",
    })!;
    // 6 − 1 (a day) − 1.5 (the party) = 3.5, the model's own prediction for the pair.
    expect(s[s.length - 1].fc).toBe(3.5);
  });

  it("places the midnights at the real local midnight across a daylight-saving change", () => {
    const ny: ModelPool = { ...pool, timezone: "America/New_York" };
    // Fall back on Sun Nov 1, 2026: midnight Nov 2 is 05:00Z (EST), midnight Nov 1 is 04:00Z (EDT).
    const fall = estimateFcSeries({ ...base, pool: ny, start: { at: "2026-10-31T16:00:00Z", fc: 6 }, end: "2026-11-02T16:00:00Z" })!;
    expect(fall.map((p) => p.at.slice(0, 16))).toEqual(["2026-10-31T16:00", "2026-11-01T04:00", "2026-11-02T05:00", "2026-11-02T16:00"]);
    // Spring forward on Sun Mar 8, 2026: midnight Mar 9 is 04:00Z (EDT).
    const spring = estimateFcSeries({ ...base, pool: ny, start: { at: "2026-03-07T17:00:00Z", fc: 6 }, end: "2026-03-09T16:00:00Z" })!;
    expect(spring.map((p) => p.at.slice(0, 16))).toEqual(["2026-03-07T17:00", "2026-03-08T05:00", "2026-03-09T04:00", "2026-03-09T16:00"]);
  });
});
