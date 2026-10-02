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

  it("reads with a chosen separator", () => {
    // A comma file with "7,4" quoted would split on semicolons only if asked.
    expect(parseCsv("Date;pH,x\n2026-09-27;7,4", ";").headers).toEqual(["Date", "pH,x"]);
    expect(parseCsv("Date;pH,x\n2026-09-27;7,4", ",").headers).toEqual(["Date;pH", "x"]);
  });

  it("handles an empty file", () => {
    expect(parseCsv("")).toEqual({ delimiter: ",", headers: [], rows: [], lines: [] });
  });

  it("knows the file line each row starts on, past blank lines and quoted line breaks", () => {
    const table = parseCsv('Date,FC,Notes\n\n9/27/2026,3,"two\r\nlines"\r\n9/28/2026,4,\n\n\n9/29/2026,5,x');
    expect(table.rows.map((r) => r[1])).toEqual(["3", "4", "5"]);
    expect(table.lines).toEqual([3, 5, 8]);
  });
});
