import { describe, expect, it } from "vitest";
import { cellHoursPerDay } from "@/lib/pump";
import { mapPumpScan, normalizeTime } from "../pump-map";

describe("normalizeTime", () => {
  it("reads 12- and 24-hour times", () => {
    expect(normalizeTime("8:00")).toBe("08:00");
    expect(normalizeTime("8:30 PM")).toBe("20:30");
    expect(normalizeTime("12:00 AM")).toBe("00:00");
    expect(normalizeTime("24:00")).toBe("00:00");
    expect(normalizeTime("7 am")).toBe("07:00");
    expect(normalizeTime("20:00:00")).toBe("20:00");
    expect(normalizeTime("8:15:30 PM")).toBe("20:15");
    expect(normalizeTime("noon")).toBeNull();
    expect(normalizeTime("8:00:75")).toBeNull();
  });
});

describe("mapPumpScan", () => {
  it("keeps readable runs and guesses the cell is off at low speed", () => {
    const result = mapPumpScan({
      runs: [
        { start: "8:00 AM", end: "12:00 PM", speed: 2400, speed_unit: "rpm" },
        { start: "12:00 PM", end: "8:00 PM", speed: 1200, speed_unit: "rpm" },
        { start: "later", end: "9:00 PM", speed: 3000 },
        { start: "22:00", end: "23:00", speed_label: "High" },
      ],
      confidence: "high",
    });
    expect(result.unit).toBe("rpm");
    expect(result.rows).toEqual([
      { start: "08:00", end: "12:00", speed: 2400, unit: "rpm", cell: true },
      { start: "12:00", end: "20:00", speed: 1200, unit: "rpm", cell: false },
      { start: "22:00", end: "23:00", speed: null, unit: "rpm", cell: true },
    ]);
    expect(result.confidence).toBe("high");
  });

  it("reads a schedule set by flow", () => {
    const result = mapPumpScan({
      runs: [
        { start: "7:00", end: "19:00", speed: 35, speed_unit: "gpm" },
        { start: "19:00", end: "7:00", speed: 15, speed_unit: "gpm" },
      ],
      confidence: "medium",
    });
    expect(result.unit).toBe("gpm");
    expect(result.rows).toEqual([
      { start: "07:00", end: "19:00", speed: 35, unit: "gpm", cell: true },
      { start: "19:00", end: "07:00", speed: 15, unit: "gpm", cell: false },
    ]);
  });

  it("reads a Pentair app screen: daily programs in GPM, a timer program left out, the list cut off", () => {
    // What the reader returns for the IntelliFlo app screen with Programs 1–4 and a fifth cut off.
    const result = mapPumpScan({
      runs: [
        { start: "9:00 AM", end: "11:00 AM", speed: 75, speed_unit: "gpm" },
        { start: "11:00 AM", end: "4:30 PM", speed: 55, speed_unit: "gpm" },
        { start: "4:30 PM", end: "7:30 PM", speed: 70, speed_unit: "gpm" },
      ],
      skipped: ["Program 3"],
      cut_off: true,
      confidence: "high",
    });
    expect(result.rows).toEqual([
      { start: "09:00", end: "11:00", speed: 75, unit: "gpm", cell: true },
      { start: "11:00", end: "16:30", speed: 55, unit: "gpm", cell: true },
      { start: "16:30", end: "19:30", speed: 70, unit: "gpm", cell: true },
    ]);
    expect(result.cutOff).toBe(true);
    expect(result.notes).toContain("Left out Program 3: not on the daily schedule.");
    expect(result.notes).toContain("its runs are added");
    // 9:00–19:30 with the cell on: 10.5 h a day.
    expect(cellHoursPerDay(result.rows)).toBe(10.5);
  });

  it("falls back to low confidence and no rows", () => {
    expect(mapPumpScan({})).toEqual({ rows: [], unit: "rpm", confidence: "low", notes: null, cutOff: false });
  });
});
