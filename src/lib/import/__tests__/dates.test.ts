import { describe, expect, it } from "vitest";
import { guessDateOrder, parseImportDate } from "../dates";

describe("parseImportDate", () => {
  it("reads US dates with 12-hour times", () => {
    expect(parseImportDate("9/27/2026 8:30 AM")).toEqual({ wall: "2026-09-27T08:30" });
    expect(parseImportDate("9/27/26 8:30:15 PM")).toEqual({ wall: "2026-09-27T20:30" });
    expect(parseImportDate("12/1/2026 12:05 am")).toEqual({ wall: "2026-12-01T00:05" });
    expect(parseImportDate("9/27/2026")).toEqual({ wall: "2026-09-27T12:00" });
  });

  it("reads day-first dates when asked", () => {
    expect(parseImportDate("27/09/2026 20:30", "dmy")).toEqual({ wall: "2026-09-27T20:30" });
    expect(parseImportDate("27.09.2026", "dmy")).toEqual({ wall: "2026-09-27T12:00" });
    expect(parseImportDate("27/09/2026 20:30", "mdy")).toBeNull();
  });

  it("reads ISO, with an offset as an instant", () => {
    expect(parseImportDate("2026-09-27 08:30")).toEqual({ wall: "2026-09-27T08:30" });
    expect(parseImportDate("2026-09-27T08:30:00")).toEqual({ wall: "2026-09-27T08:30" });
    expect(parseImportDate("2026-09-27T08:30:00Z")).toEqual({ instant: "2026-09-27T08:30:00.000Z" });
    expect(parseImportDate("2026-09-27T08:30:00-04:00")).toEqual({ instant: "2026-09-27T12:30:00.000Z" });
  });

  it("reads month names", () => {
    expect(parseImportDate("Sep 27, 2026 8:30 AM")).toEqual({ wall: "2026-09-27T08:30" });
    expect(parseImportDate("September 27, 2026 at 8:30 PM")).toEqual({ wall: "2026-09-27T20:30" });
    expect(parseImportDate("27 Sept 2026 20:30")).toEqual({ wall: "2026-09-27T20:30" });
  });

  it("refuses what is not a date", () => {
    expect(parseImportDate("")).toBeNull();
    expect(parseImportDate("yesterday")).toBeNull();
    expect(parseImportDate("2/30/2026")).toBeNull();
    expect(parseImportDate("9/27/2026 13:30 PM")).toBeNull();
  });
});

describe("guessDateOrder", () => {
  it("is month-first unless a first part is over 12", () => {
    expect(guessDateOrder(["9/27/2026", "10/1/2026"])).toBe("mdy");
    expect(guessDateOrder(["27/09/2026", "01/10/2026"])).toBe("dmy");
    expect(guessDateOrder(["2026-09-27"])).toBe("mdy");
  });
});
