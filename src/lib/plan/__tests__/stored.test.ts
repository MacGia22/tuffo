import { describe, expect, it } from "vitest";
import { confidenceText, estimateStartFc, parseStoredPlan, planIsStale, type StoredPlan } from "../stored";

describe("estimateStartFc", () => {
  it("takes off the predicted use since the test and adds what was logged", () => {
    // 6 ppm tested 1.5 days ago, 2 ppm added since, 2.36 ppm/day: 6 + 2 − 3.54 = 4.46.
    expect(estimateStartFc({ fc: 6, addedPpm: 2, daysSince: 1.5, dailyLossPpm: 2.36, swg: false })).toBe(4.46);
  });

  it("never goes below zero and counts at most a week", () => {
    expect(estimateStartFc({ fc: 3, addedPpm: 0, daysSince: 3, dailyLossPpm: 2, swg: false })).toBe(0);
    expect(estimateStartFc({ fc: 30, addedPpm: 0, daysSince: 20, dailyLossPpm: 2, swg: false })).toBe(16);
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

describe("confidenceText", () => {
  it("says plainly how sure the plan is", () => {
    expect(confidenceText({ confidence: "typical", pairs: 1 }, 4)).toBe(
      "Based on typical pools until you have 4 test pairs (you have 1 test pair), so it keeps a wider margin.",
    );
    expect(confidenceText({ confidence: "own", pairs: 7 }, 4)).toBe("From your pool's own chlorine use (7 test pairs) and the forecast.");
  });
});
