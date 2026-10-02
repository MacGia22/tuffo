import { describe, expect, it } from "vitest";
import {
  confidenceText,
  dayShareLeft,
  estimateStartFc,
  parseStoredPlan,
  planHasFcLine,
  planIsStale,
  planMissesDose,
  type StoredPlan,
} from "../stored";

describe("estimateStartFc", () => {
  it("takes off the predicted use since the test and adds what was logged", () => {
    // 6 ppm tested 1.5 days ago, 2 ppm added since, 2.36 ppm/day: 6 + 2 − 3.54 = 4.46.
    expect(estimateStartFc({ fc: 6, addedPpm: 2, daysSince: 1.5, dailyLossPpm: 2.36, swg: false })).toBe(4.46);
  });

  it("never goes below zero and counts at most the estimate's 10 days", () => {
    expect(estimateStartFc({ fc: 3, addedPpm: 0, daysSince: 3, dailyLossPpm: 2, swg: false })).toBe(0);
    // 30 − 10 × 2 = 10, the same as the estimate's last point: no jump back up after day 10.
    expect(estimateStartFc({ fc: 30, addedPpm: 0, daysSince: 20, dailyLossPpm: 2, swg: false })).toBe(10);
    expect(estimateStartFc({ fc: 25, addedPpm: 0, daysSince: 9, dailyLossPpm: 2.36, swg: false })).toBe(3.76);
    expect(estimateStartFc({ fc: 25, addedPpm: 0, daysSince: 11, dailyLossPpm: 2.36, swg: false })).toBe(1.4);
  });

  it("carries a salt pool's level, since the cell has been running", () => {
    expect(estimateStartFc({ fc: 4, addedPpm: 0, daysSince: 2, dailyLossPpm: 2, swg: true })).toBe(4);
  });
});

describe("planIsStale", () => {
  const plan = { computedAt: "2026-09-30T06:00:00Z" } as StoredPlan;
  const now = Date.parse("2026-09-30T12:00:00Z");

  it("is fresh within a day and after the latest test", () => {
    expect(planIsStale(plan, "2026-09-30T05:00:00Z", now)).toBe(false);
  });

  it("is stale when missing, older than 26 hours, or older than the latest test", () => {
    expect(planIsStale(null, null, now)).toBe(true);
    expect(planIsStale(plan, null, Date.parse("2026-10-01T09:00:00Z"))).toBe(true);
    expect(planIsStale(plan, "2026-09-30T08:00:00Z", now)).toBe(true);
  });
});

describe("parseStoredPlan", () => {
  it("reads a stored row and refuses a malformed one", () => {
    const row = { computed_at: "2026-09-30T06:00:00Z", version: 1, summary: { fcStart: 5, fc: { min: 3 } }, days: [] };
    expect(parseStoredPlan(row)?.summary.fcStart).toBe(5);
    expect(parseStoredPlan({ ...row, summary: {} })).toBeNull();
    expect(parseStoredPlan({ ...row, days: "x" })).toBeNull();
    expect(parseStoredPlan(null)).toBeNull();
  });
});

describe("planHasFcLine", () => {
  it("draws the FC forecast for liquid chlorine, and for a salt pool only once the cell's output is known", () => {
    expect(planHasFcLine({ kind: "manual", swgPercent: null })).toBe(true);
    expect(planHasFcLine({ kind: "swg", swgPercent: 20 })).toBe(true);
    expect(planHasFcLine({ kind: "swg", swgPercent: null })).toBe(false);
  });
});

describe("confidenceText", () => {
  it("says plainly how sure the plan is", () => {
    expect(confidenceText({ confidence: "typical", pairs: 1 }, 4)).toBe(
      "Based on typical pools until you have 4 test pairs (you have 1 test pair), so it keeps a wider margin.",
    );
    expect(confidenceText({ confidence: "own", pairs: 7 }, 4)).toBe("From your pool's own chlorine use (7 test pairs) and the forecast.");
  });
});

describe("plans built late in the pool's day", () => {
  it("knows how much of the local day is left", () => {
    // 06:00 UTC on Oct 2 is 11 PM on Oct 1 in Los Angeles, 4 PM in Sydney.
    expect(dayShareLeft(Date.parse("2026-10-02T06:00:00Z"), "America/Los_Angeles")).toBeCloseTo(1 / 24, 5);
    expect(dayShareLeft(Date.parse("2026-10-02T06:00:00Z"), "Australia/Sydney")).toBeCloseTo(8 / 24, 5);
    expect(dayShareLeft(Date.parse("2026-10-02T07:00:00Z"), "America/Los_Angeles")).toBe(1);
  });

  it("treats a plan whose first day is over as stale", () => {
    const plan = { computedAt: "2026-10-02T06:00:00Z", version: 1, summary: {}, days: [{ date: "2026-10-01" }] } as unknown as StoredPlan;
    const now = Date.parse("2026-10-02T15:00:00Z");
    expect(planIsStale(plan, "2026-09-30T16:00:00Z", now, "2026-10-02")).toBe(true);
    expect(planIsStale(plan, "2026-09-30T16:00:00Z", now, "2026-10-01")).toBe(false);
  });
});

describe("planMissesDose", () => {
  const plan = { computedAt: "2026-10-01T06:00:00Z" };
  const test = "2026-10-01T14:00:00Z";
  const dose = (createdAt: string, addedAt = createdAt, chlorine = true) => ({ addedAt, createdAt, chlorine });

  it("sees chlorine logged after the plan was built, since its test", () => {
    // "I added 1 qt" at 7 PM: the plan from 6 AM still says to add it.
    expect(planMissesDose(plan, [dose("2026-10-01T23:00:00Z")], test)).toBe(true);
  });

  it("ignores doses the plan already had, other products, and doses from before the test", () => {
    expect(planMissesDose(plan, [dose("2026-10-01T05:00:00Z")], test)).toBe(false);
    expect(planMissesDose(plan, [dose("2026-10-01T23:00:00Z", undefined, false)], test)).toBe(false);
    // Logged tonight for yesterday, before the test the plan starts from.
    expect(planMissesDose(plan, [dose("2026-10-01T23:00:00Z", "2026-09-30T20:00:00Z")], test)).toBe(false);
    expect(planMissesDose(null, [dose("2026-10-01T23:00:00Z")], test)).toBe(false);
  });
});
