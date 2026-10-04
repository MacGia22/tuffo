import { describe, expect, it } from "vitest";
import {
  isJpeg,
  NO_CHANGES_TEXT,
  parseReport,
  photoDeleteAfter,
  pumpChanges,
  pumpRuns,
  reportLines,
  reportPhotoPath,
  testChanges,
  type TestRead,
} from "../report";

const READ: TestRead = { fields: { fc: 3, ph: 7.8, ta: 110 }, waterTempC: 28.9, method: "store_leslies" };
// The form right after the scan filled it (84 °F shown for 28.9 °C).
const FILLED = { fc: "3", ph: "7.8", ta: "110", water_temp: "84", method: "store_leslies" };

describe("testChanges", () => {
  it("lists nothing while the form still holds what the scan read", () => {
    expect(testChanges(READ, FILLED, "us")).toEqual([]);
  });

  it("lists each changed field as read against now, with units, and stores the new value", () => {
    const changes = testChanges(READ, { ...FILLED, ph: "7.4", ta: "", salt: "3200" }, "us");
    expect(changes.map((c) => c.text)).toEqual([
      "pH: read 7.8, now 7.4",
      "Alkalinity: read 110 ppm, now blank",
      "Salt: read nothing, now 3200 ppm",
    ]);
    expect(Object.fromEntries(changes.map((c) => [c.key, c.value]))).toEqual({ ph: 7.4, ta: null, salt: 3200 });
  });

  it("treats 7.80 and 7.8 as the same number", () => {
    expect(testChanges(READ, { ...FILLED, ph: "7.80" }, "us")).toEqual([]);
  });

  it("shows water temperature in the person's units and stores °C", () => {
    const [change] = testChanges(READ, { ...FILLED, water_temp: "80" }, "us");
    expect(change.text).toBe("Water temp: read 84 °F, now 80 °F");
    expect(change).toMatchObject({ key: "water_temp_c", value: 26.7 });
    const [metric] = testChanges(READ, { ...FILLED, water_temp: "27" }, "metric");
    expect(metric.text).toBe("Water temp: read 29 °C, now 27 °C");
    expect(metric.value).toBe(27);
  });

  it("includes a changed test method", () => {
    const changes = testChanges(READ, { ...FILLED, method: "strips" }, "us");
    expect(changes).toEqual([{ key: "method", text: "Tested with: read Leslie's store test, now Test strips", value: "strips" }]);
  });
});

describe("pumpChanges", () => {
  const read = { rows: [{ start: "08:00", end: "16:00", speed: 2400, cell: true }], unit: "rpm" as const };

  it("lists nothing when the runs are as read", () => {
    expect(pumpChanges(read, { rows: pumpRuns([{ start: "08:00", end: "16:00", speed: "2400", cell: true }]), unit: "rpm" })).toEqual([]);
  });

  it("lists changed, added and removed runs and a changed unit", () => {
    const changes = pumpChanges(
      { rows: [...read.rows, { start: "20:00", end: "22:00", speed: null, cell: false }], unit: "rpm" },
      { rows: [{ start: "08:00", end: "17:00", speed: 2400, cell: true }], unit: "rpm" },
    );
    expect(changes.map((c) => c.text)).toEqual([
      "Run 1: read 08:00–16:00, 2400 RPM, cell on, now 08:00–17:00, 2400 RPM, cell on",
      "Run 2: read 20:00–22:00, cell off, now removed",
    ]);
    expect(changes[1].value).toBeNull();
    const unit = pumpChanges(read, { rows: read.rows, unit: "pct" });
    expect(unit).toEqual([{ key: "unit", text: "Set by: read speed (RPM), now speed (%)", value: "pct" }]);
  });
});

describe("parseReport", () => {
  const good = { kind: "test", source: "leslies", read: { fields: { ph: 7.8 } }, corrected: { ph: 7.4 }, note: " Smudged ", photoConsent: true };

  it("accepts a test report and trims the note", () => {
    const parsed = parseReport(JSON.stringify(good));
    expect(parsed).toEqual({
      ok: true,
      report: { kind: "test", source: "leslies", read: { fields: { ph: 7.8 } }, corrected: { ph: 7.4 }, note: "Smudged", photoConsent: true },
    });
  });

  it("refuses a report without changes, unknown fields, bad values or a long note", () => {
    expect(parseReport({ ...good, corrected: {} })).toEqual({ ok: false, error: NO_CHANGES_TEXT });
    expect(parseReport({ ...good, corrected: { email: 1 } }).ok).toBe(false);
    expect(parseReport({ ...good, corrected: { ph: "7.4" } }).ok).toBe(false);
    expect(parseReport({ ...good, corrected: { method: "magic" } }).ok).toBe(false);
    expect(parseReport({ ...good, note: "x".repeat(501) }).ok).toBe(false);
    expect(parseReport({ ...good, kind: "photo" }).ok).toBe(false);
    expect(parseReport("{not json").ok).toBe(false);
    expect(parseReport({ ...good, read: { blob: "x".repeat(20_000) } }).ok).toBe(false);
  });

  it("maps an unknown source to unknown and pump reports to pump_schedule", () => {
    const test = parseReport({ ...good, source: "<script>" });
    expect(test.ok && test.report.source).toBe("unknown");
    const pump = parseReport({ kind: "pump", source: "leslies", read: {}, corrected: { run_1: null, unit: "gpm" } });
    expect(pump.ok && pump.report.source).toBe("pump_schedule");
    expect(pump.ok && pump.report.photoConsent).toBe(false);
  });

  it("checks pump runs", () => {
    expect(parseReport({ kind: "pump", read: {}, corrected: { run_1: { start: "8am", end: "16:00", speed: null, cell: true } } }).ok).toBe(false);
    expect(parseReport({ kind: "pump", read: {}, corrected: { run_25: null } }).ok).toBe(false);
    expect(parseReport({ kind: "pump", read: {}, corrected: { run_2: { start: "08:00", end: "16:00", speed: 2400, cell: true } } }).ok).toBe(true);
  });
});

describe("isJpeg", () => {
  it("checks the magic bytes, not the name", () => {
    expect(isJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]))).toBe(true);
    expect(isJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d]))).toBe(false);
    expect(isJpeg(new Uint8Array([0xff, 0xd8]))).toBe(false);
  });
});

describe("photoDeleteAfter", () => {
  it("is twelve months on, clamped to the end of a short month", () => {
    expect(photoDeleteAfter(new Date("2026-10-04T15:00:00Z"))).toBe("2027-10-04");
    expect(photoDeleteAfter(new Date("2028-02-29T10:00:00Z"))).toBe("2029-02-28");
    expect(photoDeleteAfter(new Date("2026-12-31T23:59:00Z"))).toBe("2027-12-31");
  });
});

describe("reportPhotoPath", () => {
  it("keeps each person's photos in their own folder", () => {
    expect(reportPhotoPath("u1", "r1")).toBe("u1/r1.jpg");
  });
});

describe("reportLines", () => {
  it("shows read → corrected for a test, in database units", () => {
    expect(reportLines("test", { fields: { ph: 7.8 }, waterTempC: 28.9, method: "strips" }, { ph: 7.4, water_temp_c: 26.7, fc: 2 })).toEqual([
      { label: "pH", read: "7.8", corrected: "7.4" },
      { label: "Water temp", read: "28.9 °C", corrected: "26.7 °C" },
      { label: "Free chlorine", read: "nothing", corrected: "2 ppm" },
    ]);
  });

  it("shows runs for a pump schedule and copes with junk", () => {
    expect(
      reportLines("pump", { rows: [{ start: "08:00", end: "16:00", speed: 2400, cell: true }], unit: "rpm" }, { run_1: null, run_2: { start: "18:00", end: "20:00", speed: null, cell: true } }),
    ).toEqual([
      { label: "Run 1", read: "08:00–16:00, 2400 RPM, cell on", corrected: "removed" },
      { label: "Run 2", read: "nothing", corrected: "18:00–20:00, cell on" },
    ]);
    expect(reportLines("test", null, "nope")).toEqual([]);
  });
});
