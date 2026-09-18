import { describe, expect, it } from "vitest";
import { mapScan } from "../map";

const usage = { model: "test", inputTokens: 0, outputTokens: 0 };

describe("mapScan", () => {
  it("maps a Leslie's printout", () => {
    const result = mapScan(
      {
        source: "leslies",
        readings: {
          free_chlorine_ppm: 3.2,
          total_chlorine_ppm: 3.6,
          ph: 7.8,
          total_alkalinity_ppm: 110,
          calcium_hardness_ppm: 320,
          cyanuric_acid_ppm: 45,
          phosphate_ppb: 250,
          iron_ppm: 0,
          water_temperature: 86,
          water_temperature_unit: "F",
        },
        test_date: "2026-09-18",
        confidence: "high",
        uncertain_fields: [],
      },
      usage,
    );
    expect(result.fields).toEqual({ fc: 3.2, cc: 0.4, ph: 7.8, ta: 110, ch: 320, cya: 45, phosphate: 250 });
    expect(result.waterTempC).toBe(30);
    expect(result.method).toBe("store_leslies");
    expect(result.testDate).toBe("2026-09-18");
    expect(result.confidence).toBe("high");
  });

  it("drops impossible values and flags them", () => {
    const result = mapScan(
      { source: "test_strip", readings: { ph: 14, free_chlorine_ppm: "2 ppm" }, confidence: "low", uncertain_fields: ["ph"] },
      usage,
    );
    expect(result.fields).toEqual({ fc: 2 });
    expect(result.uncertain).toEqual(["ph"]);
    expect(result.method).toBe("strips");
  });

  it("guesses the temperature unit from the number when missing", () => {
    expect(mapScan({ readings: { water_temperature: 84 }, confidence: "high", uncertain_fields: [] }, usage).waterTempC).toBe(28.9);
    expect(mapScan({ readings: { water_temperature: 28 }, confidence: "high", uncertain_fields: [] }, usage).waterTempC).toBe(28);
  });

  it("renames uncertain fields to the form's names and tolerates junk", () => {
    const result = mapScan({ source: "whatever", confidence: "maybe", uncertain_fields: ["cyanuric_acid_ppm"], test_date: "yesterday" }, usage);
    expect(result.fields).toEqual({});
    expect(result.uncertain).toEqual(["cya"]);
    expect(result.method).toBe("other");
    expect(result.confidence).toBe("low");
    expect(result.testDate).toBeNull();
  });
});
