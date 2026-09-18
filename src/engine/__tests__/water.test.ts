import { describe, expect, it } from "vitest";
import { saturationIndex, saturationVerdict } from "../csi";
import { alkalinityAt, carbonateAlkalinity, pHForAlkalinity, stateFromReading } from "../water";

describe("carbonate model", () => {
  it("round-trips a reading: the state's alkalinity at the measured pH is the measured TA", () => {
    const reading = { pH: 7.6, ta: 90, cya: 50 };
    const state = stateFromReading(reading);
    expect(alkalinityAt(reading.pH, state) * 50_044).toBeCloseTo(90, 6);
    expect(pHForAlkalinity(alkalinityAt(reading.pH, state), state)).toBeCloseTo(7.6, 6);
  });

  it("attributes roughly a third of the CYA to alkalinity at pH 7.5", () => {
    const withCya = carbonateAlkalinity({ pH: 7.5, ta: 80, cya: 60 });
    const without = carbonateAlkalinity({ pH: 7.5, ta: 80, cya: 0 });
    expect(without).toBeCloseTo(80, 0);
    expect(without - withCya).toBeGreaterThan(17);
    expect(without - withCya).toBeLessThan(23);
  });
});

describe("saturation index", () => {
  it("reads slightly negative for typical balanced Florida water", () => {
    const csi = saturationIndex({ pH: 7.5, ta: 80, cya: 40, ch: 300, tempC: 28, tds: 1000 });
    expect(csi).toBeGreaterThan(-0.3);
    expect(csi).toBeLessThan(0.05);
    expect(saturationVerdict(csi)).toBe("balanced");
  });

  it("rises with pH, calcium and temperature", () => {
    const base = { pH: 7.5, ta: 80, cya: 40, ch: 300, tempC: 28, tds: 1000 };
    expect(saturationIndex({ ...base, pH: 8.0 })).toBeGreaterThan(saturationIndex(base));
    expect(saturationIndex({ ...base, ch: 600 })).toBeGreaterThan(saturationIndex(base));
    expect(saturationIndex({ ...base, tempC: 35 })).toBeGreaterThan(saturationIndex(base));
  });

  it("flags cold, soft, acidic water as corrosive and hot, hard, basic water as scaling", () => {
    expect(saturationVerdict(saturationIndex({ pH: 7.0, ta: 50, cya: 30, ch: 100, tempC: 10 }))).toBe(
      "corrosive",
    );
    expect(saturationVerdict(saturationIndex({ pH: 8.2, ta: 140, cya: 30, ch: 600, tempC: 34 }))).toBe(
      "scaling",
    );
  });
});
