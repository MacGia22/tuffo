import { describe, expect, it } from "vitest";
import { parseCsv } from "../csv";

describe("parseCsv", () => {
  it("reads quoted fields, doubled quotes, commas and line breaks inside quotes", () => {
    const table = parseCsv('﻿Date,FC,Notes\r\n9/27/2026 8:30 AM,3.5,"cloudy, after ""party""\nclear by noon"\r\n');
    expect(table.headers).toEqual(["Date", "FC", "Notes"]);
    expect(table.rows).toEqual([["9/27/2026 8:30 AM", "3.5", 'cloudy, after "party"\nclear by noon']]);
  });

  it("detects semicolons and tabs, and skips blank lines", () => {
    expect(parseCsv("Date;pH\n27.09.2026;7,4\n\n").rows).toEqual([["27.09.2026", "7,4"]]);
    expect(parseCsv("Date\tpH\n2026-09-27\t7.4").rows).toEqual([["2026-09-27", "7.4"]]);
  });

  it("handles an empty file", () => {
    expect(parseCsv("")).toEqual({ headers: [], rows: [] });
  });
});
