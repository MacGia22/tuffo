import { describe, expect, it } from "vitest";
import { isRainDate, rainForForm, rainFromForm, withOwnRain } from "../own-rain";

describe("withOwnRain", () => {
  const rows = [
    { date: "2026-09-27", precipitation_mm: 50.8, uv_index_max: 9 },
    { date: "2026-09-28", precipitation_mm: null, uv_index_max: 8 },
    { date: "2026-09-29", precipitation_mm: 3, uv_index_max: 7 },
  ];

  it("puts the pool's rain in place of the cell's on those days only", () => {
    const out = withOwnRain(rows, [
      { date: "2026-09-27", rain_mm: 12.7 },
      { date: "2026-09-28", rain_mm: 0 },
    ]);
    expect(out.map((r) => [r.precipitation_mm, r.ownRain])).toEqual([
      [12.7, true],
      [0, true],
      [3, false],
    ]);
    expect(out[0].uv_index_max).toBe(9);
  });

  it("reads numeric strings from the database", () => {
    const out = withOwnRain(rows, [{ date: "2026-09-29", rain_mm: "1.5" as unknown as number }]);
    expect(out[2].precipitation_mm).toBe(1.5);
  });

  it("leaves rows alone without the pool's rain", () => {
    expect(withOwnRain(rows, []).every((r) => !r.ownRain)).toBe(true);
  });
});

describe("rainFromForm", () => {
  it("turns inches into millimeters", () => {
    expect(rainFromForm("0.5", "us")).toEqual({ ok: true, mm: 12.7 });
    expect(rainFromForm("2", "us")).toEqual({ ok: true, mm: 50.8 });
  });

  it("keeps millimeters, accepting a decimal comma", () => {
    expect(rainFromForm("12,5", "metric")).toEqual({ ok: true, mm: 12.5 });
  });

  it("accepts no rain", () => {
    expect(rainFromForm("0", "us")).toEqual({ ok: true, mm: 0 });
  });

  it("refuses blanks, negatives and more than 500 mm", () => {
    expect(rainFromForm("", "us").ok).toBe(false);
    expect(rainFromForm("-1", "metric").ok).toBe(false);
    expect(rainFromForm("abc", "metric").ok).toBe(false);
    expect(rainFromForm("20", "us").ok).toBe(false);
    expect(rainFromForm("501", "metric").ok).toBe(false);
  });
});

describe("rainForForm", () => {
  it("shows inches or millimeters", () => {
    expect(rainForForm(12.7, "us")).toBe("0.5");
    expect(rainForForm(12.7, "metric")).toBe("12.7");
  });
});

describe("isRainDate", () => {
  it("accepts today and past days within a year", () => {
    expect(isRainDate("2026-09-30", "2026-09-30")).toBe(true);
    expect(isRainDate("2026-01-15", "2026-09-30")).toBe(true);
  });

  it("refuses the future, old dates and bad input", () => {
    expect(isRainDate("2026-10-01", "2026-09-30")).toBe(false);
    expect(isRainDate("2025-09-01", "2026-09-30")).toBe(false);
    expect(isRainDate("2026-02-30", "2026-09-30")).toBe(false);
    expect(isRainDate("yesterday", "2026-09-30")).toBe(false);
  });
});
