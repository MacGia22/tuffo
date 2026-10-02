import { describe, expect, it } from "vitest";
import { shelfToBase } from "../dose-format";
import { doseEditValues, eventEditValues, readingEditValues } from "../edit-values";

const tz = "America/New_York";

describe("readingEditValues", () => {
  const reading = {
    taken_at: "2026-09-27T12:30:00Z",
    fc: "4.50",
    cc: null,
    ph: 7.4,
    ta: "80.0",
    ch: null,
    cya: 40,
    salt: null,
    borate: null,
    phosphate: null,
    water_temp_c: "28.5",
    method: "drop_kit",
    notes: null,
  };

  it("shows numbers as typed, the time at the pool and °F for US units", () => {
    const v = readingEditValues(reading, "us", tz);
    expect(v).toMatchObject({ fc: "4.5", cc: "", ph: "7.4", ta: "80", cya: "40", method: "drop_kit", notes: "" });
    expect(v.water_temp).toBe("83.3"); // 28.5 °C
    expect(v.taken_at).toBe("2026-09-27T08:30");
  });

  it("shows whole °F when that saves back unchanged", () => {
    // 83 °F is stored as 28.3 °C; 82.9 °F would save as 28.3 °C too, but reads oddly.
    expect(readingEditValues({ ...reading, water_temp_c: "28.3" }, "us", tz).water_temp).toBe("83");
    expect(readingEditValues({ ...reading, water_temp_c: 26.7 }, "us", tz).water_temp).toBe("80");
  });

  it("keeps °C for metric", () => {
    expect(readingEditValues(reading, "metric", "UTC")).toMatchObject({ water_temp: "28.5", taken_at: "2026-09-27T12:30" });
  });
});

describe("doseEditValues", () => {
  it("puts the exact amount in the unit the list shows", () => {
    // 1,900 mL shows as "2 qt" in the list; the form holds 2.008 qt so saving keeps 1,900 mL.
    const v = doseEditValues(
      { product_id: "liquid-chlorine-12.5", amount: "1900.00", unit: "mL", added_at: "2026-09-27T12:30:00Z", notes: "evening" },
      "us",
      tz,
    );
    expect(v).toEqual({ product: "liquid-chlorine-12.5", amount: "2.008", unit: "qt", added_at: "2026-09-27T08:30", notes: "evening" });
    expect(Math.abs(shelfToBase(2.008, "qt").amount - 1900)).toBeLessThan(1);
  });

  it("uses kilograms for a metric salt dose", () => {
    const v = doseEditValues({ product_id: "salt", amount: 18144, unit: "g", added_at: "2026-09-27T12:30:00Z", notes: null }, "metric", "UTC");
    expect(v).toMatchObject({ amount: "18.144", unit: "kg" });
  });
});

describe("eventEditValues", () => {
  it("shows a water-level change in inches for US units", () => {
    const v = eventEditValues({ kind: "refill", value: "5.08", occurred_at: "2026-09-27T12:30:00Z", notes: null }, "us", tz);
    expect(v).toEqual({ kind: "refill", value: "2", occurred_at: "2026-09-27T08:30", notes: "" });
  });

  it("keeps a swimmer count and centimetres for metric", () => {
    expect(eventEditValues({ kind: "heavy_use", value: 12, occurred_at: "2026-09-27T12:30:00Z", notes: "party" }, "us", tz).value).toBe("12");
    expect(eventEditValues({ kind: "refill", value: 5, occurred_at: "2026-09-27T12:30:00Z", notes: null }, "metric", tz).value).toBe("5");
  });
});
