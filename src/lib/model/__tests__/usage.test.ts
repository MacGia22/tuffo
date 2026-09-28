import { describe, expect, it } from "vitest";
import { DEFAULT_PRIOR, fitChlorineModel, storedCoefficients } from "@/engine";
import { chlorineUse } from "../usage";

const stored = (sampleCount: number) => ({
  coefficients: storedCoefficients({ ...fitChlorineModel([]), sampleCount }, 35),
  sample_count: sampleCount,
});

describe("chlorineUse", () => {
  it("stays hidden until the pool has 4 test pairs", () => {
    expect(chlorineUse(null, { cya: 40, covered: false })).toBeNull();
    expect(chlorineUse(stored(3), { cya: 40, covered: false })).toBeNull();
  });

  it("gives the reference sunny day's use, not the coefficients", () => {
    const use = chlorineUse(stored(6), { cya: 40, covered: false });
    // The default prior: 0.5 + 0.45 × 10/3 + 0.05 × 7.2 = 2.36 → 2.4
    expect(use).toEqual({ sunnyDayPpm: 2.4, pairs: 6, spanDays: 35, cyaAssumed: false });
    expect(Object.keys(use ?? {})).not.toContain("coefficients");
  });

  it("assumes 40 ppm stabilizer when there is no test for it, and says so", () => {
    const use = chlorineUse(stored(6), { cya: null, covered: false });
    expect(use?.sunnyDayPpm).toBe(2.4);
    expect(use?.cyaAssumed).toBe(true);
  });

  it("uses less under a cover and with more stabilizer", () => {
    const open = chlorineUse(stored(6), { cya: 40, covered: false })!.sunnyDayPpm;
    expect(chlorineUse(stored(6), { cya: 40, covered: true })!.sunnyDayPpm).toBeLessThan(open);
    expect(chlorineUse(stored(6), { cya: 80, covered: false })!.sunnyDayPpm).toBeLessThan(open);
  });

  it("ignores coefficients from another model version", () => {
    expect(chlorineUse({ coefficients: { version: 0 }, sample_count: 9 }, { cya: 40, covered: false })).toBeNull();
    expect(DEFAULT_PRIOR.mean.base).toBe(0.5);
  });
});
