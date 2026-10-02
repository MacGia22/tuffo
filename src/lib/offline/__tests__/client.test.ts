import { afterEach, describe, expect, it } from "vitest";
import { offsetAt } from "../client";

const TZ = process.env.TZ;

describe("offsetAt", () => {
  afterEach(() => {
    process.env.TZ = TZ;
  });

  it("takes the offset at the entered time, not at the time of sending", () => {
    process.env.TZ = "America/New_York";
    // Oct 31 is still daylight time (UTC−4, offset 240); Nov 2 is standard time (300).
    expect(offsetAt("2026-10-31T08:30")).toBe(240);
    expect(offsetAt("2026-11-02T08:30")).toBe(300);
    // Spring: Mar 7 is standard (300), Mar 9 daylight (240).
    expect(offsetAt("2026-03-07T08:30")).toBe(300);
    expect(offsetAt("2026-03-09T08:30")).toBe(240);
  });

  it("uses the current offset for an empty value (now)", () => {
    expect(offsetAt("")).toBe(new Date().getTimezoneOffset());
    expect(offsetAt(null)).toBe(new Date().getTimezoneOffset());
  });
});
