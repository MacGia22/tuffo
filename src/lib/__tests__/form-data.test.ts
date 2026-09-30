import { describe, expect, it } from "vitest";
import {
  formFields,
  instantFromLocal,
  instantInZone,
  isTimeZone,
  isUuid,
  localInZone,
  optionalNumber,
  text,
  whenFromForm,
} from "../form-data";

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [k, v] of Object.entries(entries)) data.set(k, v);
  return data;
}

describe("form helpers", () => {
  it("reads text and numbers", () => {
    const data = form({ a: "  hello ", n: "1,250.5", bad: "abc", empty: "" });
    expect(text(data, "a")).toBe("hello");
    expect(text(data, "missing")).toBe("");
    expect(optionalNumber(data, "n")).toBe(1250.5);
    expect(optionalNumber(data, "bad")).toBe("invalid");
    expect(optionalNumber(data, "empty")).toBeNull();
    expect(formFields(data)).toMatchObject({ a: "  hello ", n: "1,250.5" });
  });

  it("recognises UUIDs", () => {
    expect(isUuid("7b0d8f2e-1c3a-4b5c-9d6e-0f1a2b3c4d5e")).toBe(true);
    expect(isUuid("not-a-uuid")).toBe(false);
  });
});

describe("instantFromLocal", () => {
  const now = Date.parse("2026-09-27T16:00:00Z");

  it("places a local time with the browser offset", () => {
    // 08:30 in Florida (EDT, offset 240) is 12:30 UTC.
    expect(instantFromLocal("2026-09-27T08:30", 240, now)).toEqual({ ok: true, iso: "2026-09-27T12:30:00.000Z" });
    // 14:00 in Rome (CEST, offset -120) is 12:00 UTC.
    expect(instantFromLocal("2026-09-27T14:00", -120, now)).toEqual({ ok: true, iso: "2026-09-27T12:00:00.000Z" });
  });

  it("treats empty as now and refuses nonsense and the future", () => {
    expect(instantFromLocal("", 240, now)).toEqual({ ok: true, iso: null });
    expect(instantFromLocal("yesterday", 240, now).ok).toBe(false);
    expect(instantFromLocal("2026-09-28T08:30", 240, now)).toEqual({ ok: false, error: "That time is in the future." });
  });

  it("ignores an absurd offset", () => {
    expect(instantFromLocal("2026-09-27T08:30", 99999, now)).toEqual({ ok: true, iso: "2026-09-27T08:30:00.000Z" });
  });
});

describe("pool time zones", () => {
  it("shows an instant on the pool's wall clock", () => {
    expect(localInZone("2026-09-27T12:30:45Z", "America/New_York")).toBe("2026-09-27T08:30");
    expect(localInZone("2026-01-15T12:30:00Z", "America/New_York")).toBe("2026-01-15T07:30");
    expect(localInZone("2026-09-27T12:30:00Z", "UTC")).toBe("2026-09-27T12:30");
  });

  it("reads a wall-clock time in the pool's zone, summer and winter", () => {
    const now = Date.parse("2027-01-01T00:00:00Z");
    expect(instantInZone("2026-09-27T08:30", "America/New_York", now)).toEqual({ ok: true, iso: "2026-09-27T12:30:00.000Z" });
    expect(instantInZone("2026-01-15T07:30", "America/New_York", now)).toEqual({ ok: true, iso: "2026-01-15T12:30:00.000Z" });
    expect(instantInZone("2026-09-27T20:00", "Europe/Rome", now)).toEqual({ ok: true, iso: "2026-09-27T18:00:00.000Z" });
  });

  it("round-trips across the autumn clock change", () => {
    const now = Date.parse("2027-01-01T00:00:00Z");
    // 2026-11-01 01:30 happens twice in New York; either reading is a valid instant.
    const result = instantInZone("2026-11-01T03:00", "America/New_York", now);
    expect(result).toEqual({ ok: true, iso: "2026-11-01T08:00:00.000Z" });
    expect(localInZone("2026-11-01T08:00:00Z", "America/New_York")).toBe("2026-11-01T03:00");
  });

  it("refuses bad values and the future", () => {
    const now = Date.parse("2026-09-27T12:00:00Z");
    expect(instantInZone("", "UTC", now)).toEqual({ ok: true, iso: null });
    expect(instantInZone("tomorrow", "UTC", now).ok).toBe(false);
    expect(instantInZone("2026-09-27T15:00", "UTC", now)).toEqual({ ok: false, error: "That time is in the future." });
  });

  it("knows a time zone name", () => {
    expect(isTimeZone("America/Phoenix")).toBe(true);
    expect(isTimeZone("Mars/Olympus")).toBe(false);
    expect(isTimeZone("")).toBe(false);
  });
});

describe("whenFromForm", () => {
  it("keeps the stored time when an edit leaves it unchanged or empty", () => {
    const base = { time_zone: "America/New_York", taken_at_original: "2026-09-27T08:30" };
    expect(whenFromForm(form({ ...base, taken_at: "2026-09-27T08:30" }), "taken_at")).toEqual({ ok: true, keep: true });
    expect(whenFromForm(form({ ...base, taken_at: "" }), "taken_at")).toEqual({ ok: true, keep: true });
  });

  it("reads a changed edit time in the pool's zone", () => {
    const result = whenFromForm(
      form({ time_zone: "America/New_York", taken_at_original: "2026-09-27T08:30", taken_at: "2026-09-26T08:30" }),
      "taken_at",
    );
    expect(result).toEqual({ ok: true, iso: "2026-09-26T12:30:00.000Z" });
  });

  it("uses the browser offset for a new entry", () => {
    expect(whenFromForm(form({ taken_at: "", tz_offset: "240" }), "taken_at")).toEqual({ ok: true, iso: null });
    expect(whenFromForm(form({ taken_at: "2026-09-26T08:30", tz_offset: "240" }), "taken_at")).toEqual({
      ok: true,
      iso: "2026-09-26T12:30:00.000Z",
    });
  });
});
