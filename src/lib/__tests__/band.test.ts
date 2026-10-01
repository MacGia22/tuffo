import { describe, expect, it } from "vitest";
import { bandAdvice } from "../plan/band";
import type { StoredPlan } from "../plan/stored";

const today = "2026-10-01"; // a Thursday
const day = (date: string, fcEnd: number, addMl = 0, algaeRisk = false) => ({
  date, lossPpm: 2, addPpm: addMl ? 1 : 0, fcAfterAdd: fcEnd + 2, fcEnd, algaeRisk, rainMm: 0, dilution: null, estimated: false, addMl,
});
const plan = (kind: "manual" | "swg", fcStart: number, swgPercent: number | null, days: ReturnType<typeof day>[]) =>
  ({ summary: { kind, fcStart, swgPercent, fc: { min: 3, targetLow: 5, targetHigh: 7, slam: 16 } }, days }) as unknown as StoredPlan;

describe("bandAdvice", () => {
  it("says nothing when the week stays in the band", () => {
    expect(bandAdvice(plan("manual", 6, null, [day("2026-10-01", 5.5, 900), day("2026-10-02", 5.4, 900)]), today, null)).toBeNull();
  });

  it("manual: skip chlorine until the plan adds again", () => {
    const p = plan("manual", 9, null, [day("2026-10-01", 8), day("2026-10-02", 6.5), day("2026-10-03", 5.5, 900)]);
    expect(bandAdvice(p, today, null)).toEqual({ direction: "high", text: "Free chlorine is above the 5–7 ppm target: skip chlorine until Saturday." });
    const none = plan("manual", 12, null, [day("2026-10-01", 10), day("2026-10-02", 8)]);
    expect(bandAdvice(none, today, null)?.text).toBe("Free chlorine is above the 5–7 ppm target: skip chlorine this week.");
  });

  it("salt: lower the cell to the next setting from the first high day", () => {
    const p = plan("swg", 6, 50, [day("2026-10-01", 6.5), day("2026-10-02", 7.4), day("2026-10-03", 8)]);
    expect(bandAdvice(p, today, [25, 50, 75, 100])?.text).toBe(
      "At 50% free chlorine climbs above 7 ppm by Friday: lower the cell to 25% from Friday, then test.",
    );
    // A 5% dial: ten points down.
    expect(bandAdvice(p, today, null)?.text).toContain("lower the cell to 40%");
    // Already at the lowest setting: switch off for a day.
    const lowest = plan("swg", 6, 25, [day("2026-10-01", 7.5)]);
    expect(bandAdvice(lowest, today, [25, 50, 75, 100])?.text).toBe(
      "Even at 25% free chlorine climbs above 7 ppm by today: switch the cell off for a day when a test shows it above 7.",
    );
  });

  it("flags a low day first", () => {
    const p = plan("manual", 4, null, [day("2026-10-01", 4, 900), day("2026-10-02", 2.5, 900, true)]);
    expect(bandAdvice(p, today, null)).toEqual({
      direction: "low",
      text: "Free chlorine may fall below 3 ppm by Friday even with the plan: test that morning and add more if it is low.",
    });
  });
});
