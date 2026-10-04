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
    expect(bandAdvice(p, today, null)).toEqual({ direction: "high", text: "Free chlorine is about 9.0 ppm, above the 5–7 ppm target: skip chlorine until Saturday." });
    const none = plan("manual", 12, null, [day("2026-10-01", 10), day("2026-10-02", 8)]);
    expect(bandAdvice(none, today, null)?.text).toBe("Free chlorine is about 12.0 ppm, above the 5–7 ppm target: skip chlorine this week.");
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

  it("salt: words the settings as levels for a cell set 1 to 8", () => {
    const levels = [12.5, 25, 37.5, 50, 62.5, 75, 87.5, 100];
    const p = plan("swg", 6, 50, [day("2026-10-01", 6.5), day("2026-10-02", 7.4), day("2026-10-03", 8)]);
    expect(bandAdvice(p, today, levels, 8)?.text).toBe(
      "At level 4 of 8 free chlorine climbs above 7 ppm by Friday: lower the cell to level 3 of 8 from Friday, then test.",
    );
    // From the stored plan's own count when none is given.
    const stored = { ...p, summary: { ...p.summary, cellLevels: 8 } } as StoredPlan;
    expect(bandAdvice(stored, today, levels)?.text).toContain("lower the cell to level 3 of 8");
  });

  it("salt: with the cell already off, says to keep it off", () => {
    // FC 20 at CYA 70 holds above the floor all week with the cell off: the plan's setting is 0%.
    const off = plan("swg", 20, 0, [day("2026-10-01", 18.1), day("2026-10-02", 16.3)]);
    expect(bandAdvice(off, today, null)?.text).toBe(
      "Free chlorine is about 20.0 ppm, above the 5–7 ppm target with the cell off: keep it off, and test before you turn it back on.",
    );
  });

  it("salt: already above the target now says so, not that it climbs above later", () => {
    // FC 7.4 today with the cell at 50%: it is already above 7, so lower the cell today.
    const p = plan("swg", 7.4, 50, [day("2026-10-01", 7.8), day("2026-10-02", 8.4)]);
    expect(bandAdvice(p, today, [25, 50, 75, 100])?.text).toBe(
      "Free chlorine is about 7.4 ppm, above the 5–7 ppm target: lower the cell to 25% today, then test in a day or two.",
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

describe("bandAdvice with a starting cell setting", () => {
  it("says when to turn the cell back up, instead of a second setting", () => {
    // The plan runs the cell off until Sunday Oct 4, then 50%; FC is above 7 today.
    const p = plan("swg", 9, 50, [day("2026-10-01", 9.5), day("2026-10-02", 8.4), day("2026-10-03", 7.6), day("2026-10-04", 9.9)]);
    p.summary.swgStart = { percent: 0, until: "2026-10-04" };
    expect(bandAdvice(p, "2026-10-01", [25, 50, 75, 100])?.text).toBe(
      "Free chlorine is above the 7 ppm target: switch the cell off until Sunday, then 50%. Test before you turn it back up.",
    );
    p.summary.swgStart = { percent: 25, until: "2026-10-04" };
    expect(bandAdvice(p, "2026-10-01", [25, 50, 75, 100])?.text).toContain("run the cell at 25% until Sunday, then 50%");
    // From the switch day on, the usual advice applies.
    expect(bandAdvice(p, "2026-10-04", [25, 50, 75, 100])?.text).toContain("At 50% free chlorine climbs above 7 ppm");
  });
});

describe("bandAdvice with a boost first", () => {
  it("says when to turn the cell down after a low start", () => {
    const p = plan("swg", 1, 15, [day("2026-10-01", 5.85), day("2026-10-02", 5.67), day("2026-10-03", 5.49)]);
    p.summary.swgStart = { percent: 60, until: "2026-10-02" };
    const advice = bandAdvice(p, "2026-10-01", null);
    expect(advice?.direction).toBe("low");
    expect(advice?.text).toContain("run the cell at 60% until Friday, then 15% so it does not climb past the target");
    // The next day the weekly setting applies and nothing leaves the band.
    expect(bandAdvice(p, "2026-10-02", null)).toBeNull();
  });
});
