import { describe, expect, it } from "vitest";
import { planUpkeep, poolDay, sameResults, splitAgainstLogged, upkeepTask } from "../logged";
import type { ImportRow } from "../readings";

const tz = "America/New_York";

function row(line: number, taken_at: string, values: ImportRow["values"], upkeep: ImportRow["upkeep"] = []): ImportRow {
  return { line, taken_at, values, water_temp_c: null, notes: null, upkeep };
}

// Gianluca's Sep 26 test: 12:00 PM in Tuffo (with FC), 9:47 AM in Pool Math (FC blank).
const logged = [{ taken_at: "2026-09-26T16:00:00.000Z", values: { fc: 5, ph: 7.4, ta: 80, ch: 250, cya: 50, salt: 2900, cc: null } }];
const poolMath = row(2, "2026-09-26T13:47:00.000Z", { ph: 7.4, ta: 80, ch: 250, cya: 50, salt: 2900 });

describe("poolDay", () => {
  it("is the date at the pool", () => {
    expect(poolDay("2026-09-27T02:30:00Z", tz)).toBe("2026-09-26"); // 10:30 PM EDT
    expect(poolDay("2026-09-27T04:30:00Z", tz)).toBe("2026-09-27");
  });
});

describe("sameResults", () => {
  it("compares the results both tests have", () => {
    expect(sameResults(poolMath.values, logged[0].values)).toBe(true);
    expect(sameResults({ ...poolMath.values, ph: 7.6 }, logged[0].values)).toBe(false);
  });

  it("needs two shared results, or all of a one-result row", () => {
    expect(sameResults({ ph: 7.4, borate: 30 }, { ph: 7.4 })).toBe(false);
    expect(sameResults({ ph: 7.4 }, { ph: 7.4, fc: 3 })).toBe(true);
    expect(sameResults({ borate: 30 }, { ph: 7.4 })).toBe(false);
  });
});

describe("splitAgainstLogged", () => {
  const sameMinute = row(3, "2026-09-26T16:00:20.000Z", { fc: 4 });
  const otherDay = row(4, "2026-09-27T13:47:00.000Z", { ph: 7.4, ta: 80, ch: 250, cya: 50, salt: 2900 });
  const rows = [poolMath, sameMinute, otherDay];

  it("skips the same minute, and same-day tests with the same results by default", () => {
    const split = splitAgainstLogged(rows, logged, tz);
    expect(split.alreadyLogged).toBe(1);
    expect(split.nearDuplicates).toEqual([{ line: 2, loggedAt: "2026-09-26T16:00:00.000Z" }]);
    expect(split.fresh.map((r) => r.line)).toEqual([4]);
  });

  it("imports near-duplicates when asked", () => {
    const split = splitAgainstLogged(rows, logged, tz, true);
    expect(split.nearDuplicates).toHaveLength(1);
    expect(split.fresh.map((r) => r.line)).toEqual([2, 4]);
  });
});

describe("upkeepTask", () => {
  it("maps a cleaned filter to the filter's cleaning task", () => {
    expect(upkeepTask("filter_clean", "cartridge")).toBe("cartridge_rinse");
    expect(upkeepTask("filter_clean", "de")).toBe("de_grids");
    expect(upkeepTask("filter_clean", "sand")).toBeNull();
    expect(upkeepTask("filter_clean", null)).toBeNull();
    expect(upkeepTask("vacuum", "cartridge")).toBeNull();
  });
});

describe("planUpkeep", () => {
  const rows = [
    row(2, "2026-09-26T13:47:00.000Z", { ph: 7.4 }, ["backwash", "filter_clean", "vacuum"]),
    row(3, "2026-09-26T20:00:00.000Z", { ph: 7.5 }, ["backwash"]), // same day: one backwash
    row(4, "2026-09-20T13:00:00.000Z", { ph: 7.5 }, ["backwash", "filter_clean"]),
    row(5, "2026-09-21T13:00:00.000Z", { ph: 7.5 }),
  ];

  it("logs one entry per day and kind, skipping what is logged or not tracked", () => {
    const plan = planUpkeep(rows, {
      timeZone: tz,
      filterType: "cartridge",
      backwashDays: new Set(["2026-09-20"]),
      doneDays: new Set(["cartridge_rinse|2026-09-26"]),
    });
    expect(plan.days).toEqual({ backwash: 2, filter_clean: 2, vacuum: 1 });
    expect(plan.events).toEqual([{ occurred_at: "2026-09-26T13:47:00.000Z" }]);
    expect(plan.maintenance).toEqual([{ task: "cartridge_rinse", done_on: "2026-09-20" }]);
    expect(plan.alreadyLogged).toBe(2);
    expect(plan.notTracked).toBe(1); // vacuuming
  });

  it("skips filter cleaning without a cartridge or DE filter", () => {
    const plan = planUpkeep(rows, { timeZone: tz, filterType: null, backwashDays: new Set(), doneDays: new Set() });
    expect(plan.maintenance).toEqual([]);
    expect(plan.events).toHaveLength(2);
    expect(plan.notTracked).toBe(3);
  });
});
