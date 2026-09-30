import { describe, expect, it } from "vitest";
import { cellHoursPerDay, scheduleFromForm } from "../pump";

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
        { start: "22:00", end: "02:00", cell: true, rpm: 2400 },
        { start: "02:00", end: "08:00", cell: false, rpm: 1100 },
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
      scheduleFromForm(form({ start_0: "08:00", end_0: "12:00", rpm_0: "2400", cell_0: "on", start_2: "12:00", end_2: "20:00", rpm_2: "1200" })),
    ).toEqual({
      ok: true,
      segments: [
        { start: "08:00", end: "12:00", cell: true, rpm: 2400 },
        { start: "12:00", end: "20:00", cell: false, rpm: 1200 },
      ],
      cellHours: 4,
    });
  });

  it("explains what is wrong", () => {
    expect(scheduleFromForm(form({}))).toEqual({ ok: false, error: "Add at least one run." });
    expect(scheduleFromForm(form({ start_0: "08:00" }))).toEqual({ ok: false, error: "Run 1 needs a start and an end time." });
    expect(scheduleFromForm(form({ start_0: "8am", end_0: "5pm" }))).toEqual({ ok: false, error: "Times look like 08:00 or 18:30." });
  });
});
