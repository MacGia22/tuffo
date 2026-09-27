import { describe, expect, it } from "vitest";
import { innerTicks, niceStep, ticks } from "../chart-scale";

describe("niceStep", () => {
  it("rounds up to 1, 2, 2.5 or 5 times a power of ten", () => {
    expect(niceStep(0.3)).toBe(0.5);
    expect(niceStep(2.2)).toBe(2.5);
    expect(niceStep(3)).toBe(5);
    expect(niceStep(7)).toBe(10);
    expect(niceStep(20)).toBe(20);
  });

  it("falls back to 1 for empty ranges", () => {
    expect(niceStep(0)).toBe(1);
    expect(niceStep(Number.NaN)).toBe(1);
  });
});

describe("ticks", () => {
  it("always reaches past the largest value", () => {
    // The bug this guards: a 0-8.25 range used to stop at 5 and clip the line.
    expect(ticks(0, 8.25, 3)).toEqual([0, 5, 10]);
    expect(ticks(0, 7, 3)).toEqual([0, 2.5, 5, 7.5]);
  });

  it("encloses a range that does not start at zero", () => {
    expect(ticks(6.9, 8.1, 3)).toEqual([6.5, 7, 7.5, 8, 8.5]);
    expect(ticks(7, 8, 3)).toEqual([7, 7.5, 8]);
  });

  it("keeps exact ends when they fall on a step", () => {
    expect(ticks(0, 10, 3)).toEqual([0, 5, 10]);
    expect(ticks(0, 0.5, 2)).toEqual([0, 0.25, 0.5]);
  });

  it("covers every value for a spread of inputs", () => {
    for (const max of [0.3, 1.7, 4.4, 9.9, 12.2, 38]) {
      const t = ticks(0, max, 3);
      expect(t[0]).toBe(0);
      expect(t[t.length - 1]).toBeGreaterThanOrEqual(max);
      expect(t.length).toBeLessThanOrEqual(6);
    }
  });
});

describe("innerTicks", () => {
  it("stays inside the range", () => {
    expect(innerTicks(0, 10, 2)).toEqual([0, 5, 10]);
    expect(innerTicks(0, 10.4, 2)).toEqual([0, 10]);
    expect(innerTicks(0, 1.1, 2)).toEqual([0, 1]);
    expect(innerTicks(0, 0.5, 2)).toEqual([0, 0.25, 0.5]);
  });
});
