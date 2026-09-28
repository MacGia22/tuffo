import { describe, expect, it } from "vitest";
import { DEFAULT_PRIOR, dayDrivers, predictLoss, type Coefficients, type Drivers } from "@/engine";
import { backtestPool, median, summarizeBacktest, type BacktestPoint } from "../backtest";
import type { TestPair } from "../observations";

const TRUE: Coefficients = { base: 1.2, sun: 0.7, heat: 0.1, rain: 0.3, use: 1.5 };

/** A pool that follows TRUE exactly: every other day the owner tops FC back up to 8. */
function pairs(count: number): TestPair[] {
  const out: TestPair[] = [];
  for (let i = 0; i < count; i += 1) {
    const drivers = dayDrivers(
      { uvIndexMax: 6 + (i % 5), sunshineHours: 8 + (i % 4), shortwaveMj: null, tmaxC: 26 + (i % 7), rainMm: i % 6 === 0 ? 12 : 0 },
      { cya: 40, covered: false, heavyUse: 0 },
    ) as Drivers;
    const loss = predictLoss(TRUE, drivers);
    out.push({
      from: new Date(Date.UTC(2026, 8, 1 + 2 * i)).toISOString(),
      to: new Date(Date.UTC(2026, 8, 3 + 2 * i)).toISOString(),
      days: 2,
      fcStart: 8,
      fcEnd: 8 - 2 * loss,
      addedPpm: 0,
      drivers,
      lossPerDay: loss,
      skip: null,
    });
  }
  return out;
}

describe("backtestPool", () => {
  it("fits only on the past: the first prediction uses no pairs", () => {
    const points = backtestPool(pairs(5), DEFAULT_PRIOR);
    expect(points.map((p) => p.pairsBefore)).toEqual([0, 1, 2, 3, 4]);
    expect(points[0].error).toBeCloseTo(points[0].priorOnlyError, 10);
  });

  it("gets better than the average pool as the pool's own pairs come in", () => {
    const points = backtestPool(pairs(20), DEFAULT_PRIOR);
    const late = points.filter((p) => p.pairsBefore >= 10);
    expect(median(late.map((p) => p.error))!).toBeLessThan(0.3);
    expect(median(late.map((p) => p.priorOnlyError))!).toBeGreaterThan(2);
  });

  it("skips pairs with a water change, and learns nothing from a bottomed-out pair", () => {
    const input = pairs(6);
    input[1] = { ...input[1], skip: "refill" };
    input[2] = { ...input[2], skip: "bottomed", fcEnd: 0.2 };
    const points = backtestPool(input, DEFAULT_PRIOR);
    expect(points).toHaveLength(5);
    expect(points.map((p) => p.pairsBefore)).toEqual([0, 1, 1, 2, 3]);
  });
});

describe("summarizeBacktest", () => {
  const point = (pairsBefore: number, error: number): BacktestPoint => ({
    pairsBefore,
    predicted: 0,
    actual: 0,
    error,
    priorOnlyError: error * 2,
  });

  it("counts predictions with 4+ pairs of history against the 1.0 ppm gate", () => {
    const summary = summarizeBacktest([point(1, 9), point(4, 0.5), point(5, 1.5), point(6, 0.8)]);
    expect(summary).toEqual({ predictions: 3, medianError: 0.8, medianPriorOnlyError: 1.6, meetsGate: true });
  });

  it("has no verdict without data", () => {
    expect(summarizeBacktest([point(2, 0.1)])).toEqual({
      predictions: 0,
      medianError: null,
      medianPriorOnlyError: null,
      meetsGate: null,
    });
  });

  it("takes the median of an even count as the mean of the middle two", () => {
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});
