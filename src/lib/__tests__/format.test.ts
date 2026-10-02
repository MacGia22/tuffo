import { describe, expect, it } from "vitest";
import { displayPressureToKpa, formatRainAmount, pressureFieldValue } from "@/lib/format";

describe("pressureFieldValue", () => {
  it("shows a stored pressure precisely enough to save it back unchanged", () => {
    // 12.5 psi is stored as 86.2 kPa; the field shows 12.5, not 13 (which would save 89.6).
    const kpa = Math.round(displayPressureToKpa(12.5, "us") * 10) / 10;
    expect(pressureFieldValue(kpa, "us")).toBe("12.5");
    expect(Math.round(displayPressureToKpa(Number(pressureFieldValue(kpa, "us")), "us") * 10) / 10).toBe(kpa);
    // 0.85 bar (85 kPa) shows 0.85, not 0.9.
    expect(pressureFieldValue(85, "metric")).toBe("0.85");
  });
});

describe("formatRainAmount", () => {
  it("never shows a misleading zero", () => {
    expect(formatRainAmount(1, "us", 1)).toBe("0.04 in");
    expect(formatRainAmount(20.3, "us", 1)).toBe("0.8 in");
    expect(formatRainAmount(19.8, "us")).toBe("0.78 in");
    expect(formatRainAmount(0.4, "metric")).toBe("0.4 mm");
    expect(formatRainAmount(6.4, "metric")).toBe("6 mm");
    // A trace, and none at all.
    expect(formatRainAmount(0.1, "us", 1)).toBe("< 0.01 in");
    expect(formatRainAmount(0.02, "metric")).toBe("< 0.1 mm");
    expect(formatRainAmount(0, "us", 1)).toBe("0 in");
    expect(formatRainAmount(0, "metric")).toBe("0 mm");
  });
});
