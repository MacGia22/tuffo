import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCsv } from "../csv";
import {
  guessMapping,
  guessTempUnit,
  MAX_IMPORT_ROWS,
  parseImportFlag,
  guessDecimalMark,
  parseImportNumber,
  planImport,
} from "../readings";

const now = Date.parse("2026-10-01T00:00:00Z");
const tz = "America/New_York";

// Headers modelled on Pool Math's measurement names; a real export will become a fixture.
const SAMPLE = `Timestamp,FC,CC,pH,TA,CH,CYA,Salt,Bor,Water Temp (°F),TDS,Notes
9/27/2026 8:30 AM,4.5,0,7.4,80,300,40,,,84,,after rain
9/27/2026 8:30 AM,4.4,0,7.4,80,300,40,,,84,,same minute again
9/28/2026 6:15 PM,3,0.5,7.6,,,,,,82,,
9/29/2026 7:00 AM,,,,,,,,,,,nothing measured
9/30/2026 7:00 AM,abc,,,,,,,,,,
10/5/2026 7:00 AM,4,,,,,,,,,,future
not a date,4,,,,,,,,,,
`;

describe("guessMapping", () => {
  it("finds Pool Math style and plain-English headers", () => {
    const { headers } = parseCsv(SAMPLE);
    expect(guessMapping(headers)).toEqual({
      when: 0, fc: 1, cc: 2, ph: 3, ta: 4, ch: 5, cya: 6, salt: 7, borate: 8, water_temp: 9, notes: 11,
    });
    expect(guessMapping(["Date", "Free Chlorine", "Total Alkalinity", "Stabilizer", "waterTemp"])).toEqual({
      when: 0, fc: 1, ta: 2, cya: 3, water_temp: 4,
    });
  });

  it("reads the temperature unit from the header", () => {
    expect(guessTempUnit("Water Temp (°F)")).toBe("F");
    expect(guessTempUnit("Temp C")).toBe("C");
    expect(guessTempUnit("Temp")).toBeNull();
  });
});

describe("numbers with a decimal comma", () => {
  it("reads 3,5 as 3.5 and 3.200 as 3,200 when the file uses commas for decimals", () => {
    expect(parseImportNumber("3,200", ",")).toBe(3.2);
    expect(parseImportNumber("3.200", ",")).toBe(3200);
    expect(parseImportNumber("1.200,5", ",")).toBe(1200.5);
    expect(parseImportNumber("7,4", ",")).toBe(7.4);
    expect(parseImportNumber("7.4", ",")).toBe(7.4);
  });

  it("guesses the decimal mark from the cells, then from the separator", () => {
    expect(guessDecimalMark(["7,4", "3200", "80"], ";")).toBe(",");
    expect(guessDecimalMark(["7.4", "3,200", "80"], ",")).toBe(".");
    expect(guessDecimalMark(["3,200", "80"], ",")).toBe(".");
    expect(guessDecimalMark(["80", "300"], ";")).toBe(",");
    expect(guessDecimalMark(["80", "300"], ",")).toBe(".");
  });

  it("reads a semicolon file with decimal commas end to end", () => {
    const table = parseCsv("Date;FC;pH;Salt\n27.09.2026 08:30;3,5;7,4;3.200\n", ";");
    const plan = planImport(table, { mapping: { when: 0, fc: 1, ph: 2, salt: 3 }, dateOrder: "dmy", tempUnit: "C", decimal: ",", timeZone: tz, now });
    expect(plan.rows[0].values).toEqual({ fc: 3.5, ph: 7.4, salt: 3200 });
  });
});

describe("parseImportNumber", () => {
  it("reads numbers with units and decimal commas; blanks are null", () => {
    expect(parseImportNumber("3.5")).toBe(3.5);
    expect(parseImportNumber("7,4")).toBe(7.4);
    expect(parseImportNumber("3,200")).toBe(3200); // a decimal point file: thousands
    expect(parseImportNumber("1,200.5")).toBe(1200.5);
    expect(parseImportNumber("3200 ppm")).toBe(3200);
    expect(parseImportNumber("")).toBeNull();
    expect(parseImportNumber("n/a")).toBeNull();
    expect(Number.isNaN(parseImportNumber("abc"))).toBe(true);
  });
});

describe("planImport", () => {
  const table = parseCsv(SAMPLE);
  const plan = planImport(table, { mapping: guessMapping(table.headers), dateOrder: "mdy", tempUnit: "F", timeZone: tz, now });

  it("imports good rows in the pool's time zone, in SI units", () => {
    expect(plan.rows).toHaveLength(2);
    expect(plan.rows[0]).toEqual({
      line: 2,
      taken_at: "2026-09-27T12:30:00.000Z", // 8:30 EDT
      values: { fc: 4.5, cc: 0, ph: 7.4, ta: 80, ch: 300, cya: 40 },
      water_temp_c: 28.9, // 84 °F
      notes: "after rain",
      upkeep: [],
    });
    expect(plan.rows[1]).toMatchObject({ line: 4, taken_at: "2026-09-28T22:15:00.000Z", values: { fc: 3, cc: 0.5, ph: 7.6 } });
  });

  it("drops a second row in the same minute and explains the rest", () => {
    expect(plan.duplicatesInFile).toBe(1);
    expect(plan.problems).toEqual([
      { line: 5, reason: "No test results in this row." },
      { line: 6, reason: 'Free chlorine "abc" is not a number.' },
      { line: 7, reason: "That time is in the future." },
      { line: 8, reason: '"not a date" is not a date Tuffo can read.' },
    ]);
  });

  it("needs a date column", () => {
    const result = planImport(table, { mapping: { fc: 1 }, dateOrder: "mdy", tempUnit: "F", timeZone: tz, now });
    expect(result.rows).toHaveLength(0);
    expect(result.problems[0].reason).toBe("Choose the column with the date.");
  });

  it("reads at most 5,000 rows", () => {
    const many = { headers: ["Date", "FC"], rows: Array.from({ length: MAX_IMPORT_ROWS + 3 }, (_, i) => [`2020-01-01T00:00:00Z`, String(i % 10)]) };
    const result = planImport(many, { mapping: { when: 0, fc: 1 }, dateOrder: "mdy", tempUnit: "F", timeZone: tz, now });
    expect(result.overLimit).toBe(3);
    expect(result.rows.length + result.duplicatesInFile).toBe(MAX_IMPORT_ROWS);
  });

});

describe("Pool Math's Test Logs export", () => {
  const csv = readFileSync(join(__dirname, "fixtures", "poolmath-export.csv"), "utf8");
  const table = parseCsv(csv);
  const mapping = guessMapping(table.headers);

  it("maps its columns, leaving CSI out", () => {
    expect(mapping).toEqual({
      when: 0, fc: 1, ph: 2, ta: 3, ch: 4, cya: 5, salt: 6, water_temp: 7, backwashed: 9, filter_cleaned: 10, vacuumed: 11, notes: 12,
    });
  });

  it("reads its 12-hour dates in the pool's time zone and skips a blank FC", () => {
    const plan = planImport(table, { mapping, dateOrder: "mdy", tempUnit: "F", timeZone: tz, now });
    expect(plan.problems).toEqual([]);
    expect(plan.rows).toEqual([
      {
        line: 2,
        taken_at: "2026-09-26T13:47:00.000Z", // 9:47 AM EDT
        values: { ph: 7.4, ta: 80, ch: 250, cya: 50, salt: 2900 },
        water_temp_c: null,
        notes: null,
        upkeep: [],
      },
    ]);
  });

  it("reads True in the upkeep columns", () => {
    const marked = csv.replace('"False","False","False"', '"True","False","True"');
    const plan = planImport(parseCsv(marked), { mapping, dateOrder: "mdy", tempUnit: "F", timeZone: tz, now });
    expect(plan.rows[0].upkeep).toEqual(["backwash", "vacuum"]);
  });
});

describe("parseImportFlag", () => {
  it("reads true-ish values", () => {
    expect(["True", "true", "yes", "1", "x"].map(parseImportFlag)).toEqual([true, true, true, true, true]);
    expect(["False", "", "0", "no", undefined].map(parseImportFlag)).toEqual([false, false, false, false, false]);
  });
});
