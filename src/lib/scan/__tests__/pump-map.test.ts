import { describe, expect, it } from "vitest";
import { mapPumpScan, normalizeTime } from "../pump-map";

describe("normalizeTime", () => {
  it("reads 12- and 24-hour times", () => {
    expect(normalizeTime("8:00")).toBe("08:00");
    expect(normalizeTime("8:30 PM")).toBe("20:30");
    expect(normalizeTime("12:00 AM")).toBe("00:00");
    expect(normalizeTime("24:00")).toBe("00:00");
    expect(normalizeTime("7 am")).toBe("07:00");
    expect(normalizeTime("noon")).toBeNull();
  });
});

describe("mapPumpScan", () => {
  it("keeps readable runs and guesses the cell is off at low speed", () => {
    const result = mapPumpScan({
      runs: [
        { start: "8:00 AM", end: "12:00 PM", rpm: 2400 },
        { start: "12:00 PM", end: "8:00 PM", rpm: 1200 },
        { start: "later", end: "9:00 PM", rpm: 3000 },
        { start: "22:00", end: "23:00", speed_label: "High" },
      ],
      confidence: "high",
    });
    expect(result.rows).toEqual([
      { start: "08:00", end: "12:00", rpm: 2400, cell: true },
      { start: "12:00", end: "20:00", rpm: 1200, cell: false },
      { start: "22:00", end: "23:00", rpm: null, cell: true },
    ]);
    expect(result.confidence).toBe("high");
  });

  it("falls back to low confidence and no rows", () => {
    expect(mapPumpScan({})).toEqual({ rows: [], confidence: "low", notes: null });
  });
});
