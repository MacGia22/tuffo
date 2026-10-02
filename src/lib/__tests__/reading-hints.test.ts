import { describe, expect, it } from "vitest";
import { lastValues, rangeHint, type PastReading } from "@/lib/reading-hints";

const blank: Omit<PastReading, "taken_at"> = {
  method: null,
  fc: null,
  cc: null,
  ph: null,
  ta: null,
  ch: null,
  cya: null,
  salt: null,
  borate: null,
  phosphate: null,
  water_temp_c: null,
};

describe("lastValues", () => {
  it("takes each measure from the newest test that has it", () => {
    const readings: PastReading[] = [
      { ...blank, taken_at: "2026-09-30T15:00:00Z", method: "strips", fc: 5, ph: "7.45" },
      { ...blank, taken_at: "2026-09-26T15:00:00Z", method: "drop_kit", fc: 8, ph: 7.6, cya: 40, water_temp_c: 28 },
    ];
    const last = lastValues(readings, "us", "America/New_York");
    expect(last.values.fc).toBe("5.0 on Sep 30");
    expect(last.values.ph).toBe("7.45 on Sep 30");
    expect(last.values.cya).toBe("40 on Sep 26");
    expect(last.values.water_temp).toBe("82 °F on Sep 26");
    expect(last.values.ch).toBeUndefined();
    expect(last.method).toBe("strips");
  });

  it("skips imported tests for the method and reads metric temperature", () => {
    const readings: PastReading[] = [
      { ...blank, taken_at: "2026-09-30T15:00:00Z", method: "imported", water_temp_c: 28.4 },
      { ...blank, taken_at: "2026-09-29T15:00:00Z", method: "digital" },
    ];
    const last = lastValues(readings, "metric", "UTC");
    expect(last.values.water_temp).toBe("28 °C on Sep 30");
    expect(last.method).toBe("digital");
    expect(lastValues([], "us", "UTC")).toEqual({ values: {}, method: null });
  });
});

describe("rangeHint", () => {
  it("suggests the likely decimal-point typo", () => {
    expect(rangeHint("ph", "75", "us")).toBe("pH 75? Did you mean 7.5?");
    expect(rangeHint("ph", "745", "us")).toBe("pH 745? Did you mean 7.45?");
    expect(rangeHint("fc", "50", "us")).toBe("FC 50? Did you mean 5?");
    expect(rangeHint("ta", "800", "us")).toBe("TA 800? Did you mean 80?");
  });

  it("says when a number is unusual without a clear fix", () => {
    expect(rangeHint("ph", "5.5", "us")).toBe("pH 5.5 is unusual; most pools read 6.2–8.6. Check the number.");
    expect(rangeHint("water_temp", "20", "us")).toBe("Water 20 °F is unusual; most pools read 33–110 °F. Check the number.");
  });

  it("stays quiet for normal or empty values", () => {
    expect(rangeHint("ph", "7.5", "us")).toBeNull();
    expect(rangeHint("fc", "", "us")).toBeNull();
    // A shock (SLAM) level is real: 40% of CYA 70 is 28 ppm.
    expect(rangeHint("fc", "28", "us")).toBeNull();
    expect(rangeHint("water_temp", "29", "metric")).toBeNull();
    expect(rangeHint("cya", "abc", "us")).toBeNull();
  });
});
