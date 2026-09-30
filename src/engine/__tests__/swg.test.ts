import { describe, expect, it } from "vitest";
import { cellPpmBetween } from "../swg";

// CircuPool CORE35: 1.4 lb/day at 100%, round the clock. In 15,000 gal (56,781 L):
// 1.4 × 453.592 × 1000 / 56,781 = 11.18 ppm/day.
const RATED = (1.4 * 453.59237 * 1000) / 56781;

describe("cellPpmBetween", () => {
  const hours8 = [{ at: "2026-09-01T00:00:00Z", value: 8 }];

  it("integrates a setting change: 75% for 6 days, then 50% for 1 day, 8 h a day", () => {
    // At 8 h: 11.18 × 8/24 = 3.727 ppm/day at 100%.
    // 75% × 3.727 × 6 = 16.77, then 50% × 3.727 × 1 = 1.86: 18.64 ppm.
    const ppm = cellPpmBetween({
      ratedPpmPerDay: RATED,
      settings: [
        { at: "2026-09-20T00:00:00Z", value: 75 },
        { at: "2026-09-27T12:00:00Z", value: 50 },
      ],
      hours: hours8,
      from: "2026-09-21T12:00:00Z",
      to: "2026-09-28T12:00:00Z",
    });
    expect(RATED).toBeCloseTo(11.18, 2);
    expect(ppm).toBeCloseTo(18.64, 2);
  });

  it("follows a pump schedule change too", () => {
    // 50% all along; 8 h for 1 day, then 12 h for 1 day: 0.5 × 11.18 × (8 + 12) / 24 = 4.66 ppm.
    const ppm = cellPpmBetween({
      ratedPpmPerDay: RATED,
      settings: [{ at: "2026-09-01T00:00:00Z", value: 50 }],
      hours: [...hours8, { at: "2026-09-29T00:00:00Z", value: 12 }],
      from: "2026-09-28T00:00:00Z",
      to: "2026-09-30T00:00:00Z",
    });
    expect(ppm).toBeCloseTo(4.66, 2);
  });

  it("is unknown when no setting or no schedule was in force at the first test", () => {
    const base = { ratedPpmPerDay: RATED, from: "2026-09-21T12:00:00Z", to: "2026-09-22T12:00:00Z" };
    expect(cellPpmBetween({ ...base, settings: [{ at: "2026-09-22T00:00:00Z", value: 50 }], hours: hours8 })).toBeNull();
    expect(cellPpmBetween({ ...base, settings: [{ at: "2026-09-01T00:00:00Z", value: 50 }], hours: [] })).toBeNull();
  });

  it("counts a cell set to 0% as nothing added", () => {
    const ppm = cellPpmBetween({
      ratedPpmPerDay: RATED,
      settings: [{ at: "2026-09-01T00:00:00Z", value: 0 }],
      hours: hours8,
      from: "2026-09-21T12:00:00Z",
      to: "2026-09-23T12:00:00Z",
    });
    expect(ppm).toBe(0);
  });
});
