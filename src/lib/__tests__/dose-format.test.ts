import { describe, expect, it } from "vitest";
import { baseToShelf, formatDoseAmount, isShelfUnit, shelfToBase, shelfUnits } from "../dose-format";

describe("formatDoseAmount", () => {
  it("uses shelf units in the US", () => {
    expect(formatDoseAmount(2270, "mL", "us")).toBe("2.5 qt");
    expect(formatDoseAmount(7570, "mL", "us")).toBe("2 gal");
    expect(formatDoseAmount(240, "mL", "us")).toBe("8 fl oz");
    expect(formatDoseAmount(907, "g", "us")).toBe("2 lb");
    expect(formatDoseAmount(120, "g", "us")).toBe("4 oz");
  });

  it("uses metric elsewhere", () => {
    expect(formatDoseAmount(2270, "mL", "metric")).toBe("2.3 L");
    expect(formatDoseAmount(240, "mL", "metric")).toBe("240 mL");
    expect(formatDoseAmount(45_400, "g", "metric")).toBe("45.4 kg");
    expect(formatDoseAmount(120, "g", "metric")).toBe("120 g");
  });

  it("says nothing for zero", () => {
    expect(formatDoseAmount(0, "g", "us")).toBe("nothing");
  });
});

describe("shelf conversions", () => {
  it("offers the units on the shelf", () => {
    expect(shelfUnits("liquid", "us")).toEqual(["fl oz", "qt", "gal"]);
    expect(shelfUnits("solid", "metric")).toEqual(["g", "kg"]);
  });

  it("converts shelf amounts to base units and back", () => {
    expect(shelfToBase(2.5, "qt")).toEqual({ amount: 2.5 * 946.352946, unit: "mL" });
    expect(shelfToBase(1, "lb").unit).toBe("g");
    expect(baseToShelf(shelfToBase(2.5, "qt").amount, "mL", "us")).toEqual({ value: 2.5, unit: "qt" });
    expect(baseToShelf(2270, "mL", "metric")).toEqual({ value: 2.3, unit: "L" });
  });

  it("knows its units", () => {
    expect(isShelfUnit("fl oz")).toBe(true);
    expect(isShelfUnit("cup")).toBe(false);
  });
});
