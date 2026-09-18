import { describe, expect, it } from "vitest";
import { formatDoseAmount } from "../dose-format";

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
