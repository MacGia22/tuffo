import { describe, expect, it } from "vitest";
import { formFields, instantFromLocal, isUuid, optionalNumber, text } from "../form-data";

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
