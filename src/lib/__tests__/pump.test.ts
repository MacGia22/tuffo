import { describe, expect, it } from "vitest";
import { cellHoursPerDay, cellLikelyOn, lowRunsText, pumpHoursPerDay, scheduleFromForm, speedText } from "../pump";

describe("cellHoursPerDay", () => {
  it("adds the runs with the cell on, once each", () => {
    expect(cellHoursPerDay([{ start: "08:00", end: "18:00", cell: true }])).toBe(10);
    // Overlap 16:00–18:00 counts once: 08:00–20:00 = 12 h.
    expect(
      cellHoursPerDay([
        { start: "08:00", end: "18:00", cell: true },
        { start: "16:00", end: "20:00", cell: true },
      ]),
    ).toBe(12);
  });

  it("wraps past midnight and skips low-speed runs without the cell", () => {
    expect(
      cellHoursPerDay([
        { start: "22:00", end: "02:00", cell: true, speed: 2400, unit: "rpm" },
        { start: "02:00", end: "08:00", cell: false, speed: 1100, unit: "rpm" },
      ]),
    ).toBe(4);
    expect(cellHoursPerDay([{ start: "00:00", end: "00:00", cell: true }])).toBe(24);
  });

  it("refuses a malformed time", () => {
    expect(cellHoursPerDay([{ start: "8am", end: "18:00", cell: true }])).toBeNull();
    expect(cellHoursPerDay([])).toBe(0);
  });
});

describe("scheduleFromForm", () => {
  const form = (entries: Record<string, string>) => (name: string) => entries[name] ?? null;

  it("reads the runs, skipping empty rows", () => {
    expect(
      scheduleFromForm(form({ start_0: "08:00", end_0: "12:00", speed_0: "2400", cell_0: "on", start_2: "12:00", end_2: "20:00", speed_2: "1200" })),
    ).toEqual({
      ok: true,
      segments: [
        { start: "08:00", end: "12:00", cell: true, speed: 2400, unit: "rpm" },
        { start: "12:00", end: "20:00", cell: false, speed: 1200, unit: "rpm" },
      ],
      cellHours: 4,
    });
  });

  it("reads a schedule set by flow (GPM)", () => {
    expect(
      scheduleFromForm(form({ speed_unit: "gpm", start_0: "07:00", end_0: "19:00", speed_0: "35.5", cell_0: "on", start_1: "19:00", end_1: "07:00", speed_1: "15" })),
    ).toEqual({
      ok: true,
      segments: [
        { start: "07:00", end: "19:00", cell: true, speed: 35.5, unit: "gpm" },
        { start: "19:00", end: "07:00", cell: false, speed: 15, unit: "gpm" },
      ],
      cellHours: 12,
    });
    expect(scheduleFromForm(form({ speed_unit: "gpm", start_0: "07:00", end_0: "19:00", speed_0: "900", cell_0: "on" }))).toEqual({
      ok: false,
      error: "Run 1: flow is 0 to 200 GPM.",
    });
  });

  it("guesses the cell is off at low speed or low flow", () => {
    expect(cellLikelyOn(1200, "rpm")).toBe(false);
    expect(cellLikelyOn(2400, "rpm")).toBe(true);
    expect(cellLikelyOn(15, "gpm")).toBe(false);
    expect(cellLikelyOn(30, "gpm")).toBe(true);
    expect(cellLikelyOn(null, "gpm")).toBe(true);
  });

  it("explains what is wrong", () => {
    expect(scheduleFromForm(form({}))).toEqual({ ok: false, error: "Add at least one run." });
    expect(scheduleFromForm(form({ start_0: "08:00" }))).toEqual({ ok: false, error: "Run 1 needs a start and an end time." });
    expect(scheduleFromForm(form({ start_0: "8am", end_0: "5pm" }))).toEqual({ ok: false, error: "Times look like 08:00 or 18:30." });
  });
});

describe("pumpHoursPerDay", () => {
  it("counts every run, cell on or off, overlaps once", () => {
    expect(
      pumpHoursPerDay([
        { start: "08:00", end: "12:00", cell: true },
        { start: "11:00", end: "14:00", cell: false },
        { start: "22:00", end: "02:00", cell: false },
      ]),
    ).toBe(10);
    expect(pumpHoursPerDay([{ start: "8", end: "12:00", cell: true }])).toBeNull();
  });
});

describe("speed units beyond RPM and GPM", () => {
  const form = (unit: string, speed: string) => (name: string) =>
    ({ speed_unit: unit, start_0: "08:00", end_0: "16:00", speed_0: speed, cell_0: "on" })[name] ?? null;

  it("reads flow in L/min, percent and numbered speeds", () => {
    expect(scheduleFromForm(form("lpm", "130,5"))).toMatchObject({ ok: true, segments: [{ speed: 130.5, unit: "lpm" }] });
    expect(scheduleFromForm(form("pct", "60"))).toMatchObject({ ok: true, segments: [{ speed: 60, unit: "pct" }] });
    expect(scheduleFromForm(form("level", "3"))).toMatchObject({ ok: true, segments: [{ speed: 3, unit: "level" }] });
  });

  it("refuses out-of-range values per unit", () => {
    expect(scheduleFromForm(form("pct", "120"))).toEqual({ ok: false, error: "Run 1: speed is 0 to 100%." });
    expect(scheduleFromForm(form("level", "2.5"))).toEqual({ ok: false, error: "Run 1: the speed number is a whole number up to 20." });
    expect(scheduleFromForm(form("lpm", "900"))).toEqual({ ok: false, error: "Run 1: flow is 0 to 760 L/min." });
    // An unknown unit falls back to RPM.
    expect(scheduleFromForm(form("furlongs", "2400"))).toMatchObject({ ok: true, segments: [{ unit: "rpm" }] });
  });

  it("guesses the cell from flow in L/min, and assumes it on for percent and numbered speeds", () => {
    // 20 GPM ≈ 75 L/min.
    expect(cellLikelyOn(60, "lpm")).toBe(false);
    expect(cellLikelyOn(110, "lpm")).toBe(true);
    expect(cellLikelyOn(20, "pct")).toBe(true);
    expect(cellLikelyOn(1, "level")).toBe(true);
  });

  it("words a setting as the pump shows it", () => {
    expect(speedText(2400, "rpm")).toBe("2400 RPM");
    expect(speedText(130, "lpm")).toBe("130 L/min");
    expect(speedText(60, "pct")).toBe("60%");
    expect(speedText(3, "level")).toBe("speed 3");
    expect(speedText(2400, undefined)).toBe("2400 RPM");
    expect(lowRunsText("rpm")).toBe("Runs under 1,500 RPM");
    expect(lowRunsText("lpm")).toBe("Runs under 75 L/min");
    expect(lowRunsText("pct")).toBeNull();
  });
});
