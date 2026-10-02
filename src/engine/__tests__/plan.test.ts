import { describe, expect, it } from "vitest";
import { DEFAULT_PRIOR, type WeatherDrivers } from "../model";
import { planFloor, planWeek, rainDilution, surfaceArea, type PlanInput } from "../plan";
import { doseFor } from "../dosing";

// A clear 32.2 °C (90 °F) day and a cloudy day with 2 inches (50.8 mm) of rain.
const SUNNY: WeatherDrivers = { uvIndexMax: 10, sunshineHours: 12, shortwaveMj: null, tmaxC: 32.2, rainMm: 0 };
const STORM: WeatherDrivers = { uvIndexMax: 3, sunshineHours: 2, shortwaveMj: null, tmaxC: 24, rainMm: 50.8 };

const day = (n: number, weather: WeatherDrivers) => ({ date: `2026-10-0${n}`, weather });

// 15,000 gal plaster pool, liquid chlorine, typical-pool coefficients (no own data yet).
const base: PlanInput = {
  coefficients: DEFAULT_PRIOR.mean, // base 0.5, sun 0.45, heat 0.05, rain 0.1
  pairs: 0,
  pool: { volumeL: 56781, surfaceAreaM2: null, swg: false, covered: false, surface: "plaster", cellPpmPerDay: null },
  water: { fc: 5, cya: 40, ch: 300, salt: null },
  days: [day(1, SUNNY), day(2, SUNNY), day(3, STORM)],
};

describe("planWeek, liquid chlorine", () => {
  const plan = planWeek(base)!;

  it("keeps FC above min + margin, with extra margin on typical-pool numbers", () => {
    // CYA 40: min 3, target 5–7. Floor max(3 + 1, 5 − 1) + 0.5 = 4.5.
    expect(plan.fc).toMatchObject({ min: 3, targetLow: 5, targetHigh: 7 });
    expect(plan.floor).toBe(4.5);
    expect(plan.confidence).toBe("typical");
  });

  it("predicts the loss of a sunny day and a stormy day", () => {
    // Sunny: 0.5 + 0.45 × (10 UV × 1/3 shield at 40 ppm CYA) + 0.05 × (32.2 − 25) = 2.36 ppm.
    expect(plan.days[0].lossPpm).toBeCloseTo(2.36, 2);
    // Storm: 0.5 + 0.45 × (3 × 2/12 × 1/3) + 0.1 × 5.08 cm = 1.083 ppm.
    expect(plan.days[2].lossPpm).toBeCloseTo(1.08, 2);
  });

  it("adds the smallest amount each day, in 0.25 ppm steps", () => {
    // Day 1: 4.5 + 2.36 − 5 = 1.86 → 2.0 ppm; ends at 4.64.
    // Day 2: 4.5 + 2.36 − 4.64 = 2.22 → 2.25 ppm; ends at 4.53.
    // Day 3: 4.5 + 1.083 − 4.53 = 1.05 → 1.25 ppm; ends at 4.70.
    expect(plan.days.map((d) => d.addPpm)).toEqual([2, 2.25, 1.25]);
    expect(plan.days.map((d) => d.fcEnd)).toEqual([4.64, 4.53, 4.7]);
    expect(plan.days.every((d) => d.fcEnd >= plan.floor && !d.algaeRisk)).toBe(true);
    // 2 ppm in 56,781 L is 908 mL (0.96 qt) of 12.5% liquid chlorine.
    expect(doseFor("liquid-chlorine-12.5", plan.days[0].addPpm, 56781).amount).toBeCloseTo(908.5, 0);
  });

  it("flags heavy rain with the diluted levels", () => {
    // Surface from volume at 1.5 m: 37.85 m². 50.8 mm → 1,923 L; 1,923 / 58,704 = 3.3%.
    expect(surfaceArea(base.pool)).toBeCloseTo(37.85, 2);
    expect(rainDilution(50.8, base.pool)).toBeCloseTo(0.03276, 4);
    expect(plan.days[2].dilution).toEqual({ percent: 3.3, cya: 39, ch: 290, salt: null });
    expect(plan.days[0].dilution).toBeNull();
  });

  it("says when FC would fall below the minimum without chlorine", () => {
    // 5 − 2.36 = 2.64 < 3 on day 1.
    expect(plan.lowWithoutChlorine).toBe("2026-10-01");
  });

  it("uses the pool's own numbers from 4 test pairs, with less margin", () => {
    const own = planWeek({ ...base, pairs: 6 })!;
    expect(own.confidence).toBe("own");
    expect(own.floor).toBe(4);
  });

  it("brings a low pool up to the target band on the first day", () => {
    const low = planWeek({ ...base, water: { ...base.water, fc: 1 } })!;
    // max(4.5 + 2.36 − 1, 5 − 1) = 5.86 → 6.0 ppm.
    expect(low.days[0].addPpm).toBe(6);
    expect(low.days[0].fcAfterAdd).toBe(7);
  });

  it("caps a single addition and flags the risk instead", () => {
    const empty = planWeek({ ...base, water: { ...base.water, fc: 0, cya: 90 } })!;
    // CYA 90: min 7, target 10–12; floor 9.5. Day 1 would need over 8 ppm.
    expect(empty.days[0].addPpm).toBe(8);
    expect(empty.capped).toBe(true);
    expect(empty.days[0].algaeRisk).toBe(true);
  });

  it("adds nothing while FC is high, and never less than 0.5 ppm", () => {
    const high = planWeek({ ...base, water: { ...base.water, fc: 9 } })!;
    // 9 − 2.36 = 6.64 at the end of day 1; day 2 needs 4.5 + 2.36 − 6.64 = 0.22, given as 0.5.
    expect(high.days[0].addPpm).toBe(0);
    expect(high.days[1].addPpm).toBe(0.5);
  });

  it("fills a day without weather with the average loss", () => {
    const gap = planWeek({ ...base, days: [day(1, SUNNY), day(2, { ...SUNNY, tmaxC: null, uvIndexMax: null, sunshineHours: null })] })!;
    expect(gap.days[1].estimated).toBe(true);
    expect(gap.days[1].lossPpm).toBeCloseTo(gap.days[0].lossPpm, 5);
  });

  it("needs a forecast", () => {
    expect(planWeek({ ...base, days: [] })).toBeNull();
  });
});

describe("planWeek, salt pool", () => {
  // 1.4 lb/day cell in 56,781 L: 1.4 × 453.592 × 1000 / 56,781 = 11.18 ppm/day at 100%.
  const cell = (1.4 * 453.592 * 1000) / 56781;
  const salt: PlanInput = {
    ...base,
    pool: { ...base.pool, swg: true, cellPpmPerDay: cell },
    water: { fc: 5, cya: 70, ch: 300, salt: 3200 },
    days: [1, 2, 3, 4, 5, 6, 7].map((n) => day(n, SUNNY)),
  };
  const plan = planWeek(salt)!;

  it("suggests the lowest cell output that holds FC all week", () => {
    // CYA 70 on a salt pool: min 3, target 4–6; floor max(4, 3) + 0.5 = 4.5.
    // Sunny loss at CYA 70: 0.5 + 0.45 × 10 × 2/9 + 0.36 = 1.86 ppm/day.
    // 15%: 1.68 − 1.86 = −0.18/day → 5 − 7 × 0.18 = 3.7 < 4.5. 20%: +0.38/day holds.
    expect(plan.floor).toBe(4.5);
    expect(plan.days[0].lossPpm).toBeCloseTo(1.86, 2);
    expect(plan.swgPercent).toBe(20);
    expect(plan.swgNeedPpm).toBeCloseTo(1.86, 2);
    expect(plan.days.every((d) => d.addPpm === 0 && d.fcEnd >= 4.5)).toBe(true);
    expect(plan.kind).toBe("swg");
  });

  it("picks among the settings the cell's control offers", () => {
    // Same week on a CORE35 (25/50/75/100%): 20% is not a setting; 25% makes
    // 11.18 × 0.25 = 2.80 ppm/day against 1.86 used, so FC rises and holds: 25%.
    const core = planWeek({ ...salt, pool: { ...salt.pool, cellLevels: [25, 50, 75, 100] } })!;
    expect(core.swgPercent).toBe(25);
    expect(core.days.every((d) => d.fcEnd >= 4.5)).toBe(true);
    expect(core.days[0].fcEnd).toBeCloseTo(5 + 2.8 - 1.86, 1);
    // An EDGE (12.5% steps): 12.5% makes 1.40/day, short by 0.46/day → 5 − 7 × 0.46 = 1.8 < 4.5; 25% holds.
    const edge = planWeek({
      ...salt,
      pool: { ...salt.pool, cellLevels: [12.5, 25, 37.5, 50, 62.5, 75, 87.5, 100] },
    })!;
    expect(edge.swgPercent).toBe(25);
    // FC at 30 ppm: seven days of 1.86 still leave 17, above the floor, so the cell can be off.
    const off = planWeek({ ...salt, water: { ...salt.water, fc: 30 }, pool: { ...salt.pool, cellLevels: [25, 50, 75, 100] } })!;
    expect(off.swgPercent).toBe(0);
  });

  it("starts lower while FC is above the band, then switches to the weekly setting", () => {
    // CORE35 (25/50/75/100%), FC 10 against a 4–6 target, sunny week (1.86 ppm/day used).
    // Off all week: 10 − 7 × 1.86 = −3.0, below the 4.5 floor; 25% (2.80/day, +0.94 net) is the
    // weekly setting. At 25% from today FC climbs 10.94 → 16.58: 54.3 ppm-days above 6.
    // Off for 2 days then 25%: 8.14, 6.28, then 7.22 … 10.98: 17.9 above 6, floor held.
    // Off for 3 days would end day 3 at 4.42, below the floor.
    const high = planWeek({
      ...salt,
      water: { ...salt.water, fc: 10 },
      pool: { ...salt.pool, cellLevels: [25, 50, 75, 100] },
    })!;
    expect(high.swgPercent).toBe(25);
    expect(high.swgStart).toEqual({ percent: 0, until: "2026-10-03" });
    expect(high.days[0].fcEnd).toBeCloseTo(8.14, 2);
    expect(high.days[1].fcEnd).toBeCloseTo(6.28, 2);
    expect(high.days[2].fcEnd).toBeCloseTo(7.22, 1);
    expect(high.days.every((d) => d.fcEnd >= 4.5)).toBe(true);
    // Starting inside the band, one setting serves the week.
    expect(planWeek({ ...salt, pool: { ...salt.pool, cellLevels: [25, 50, 75, 100] } })!.swgStart).toBeNull();
  });

  it("boosts a low start, then drops to a weekly setting instead of climbing all week (worked numbers)", () => {
    // FC 1.0, floor 4.5, target 4–6, 1.86 ppm/day used. Reaching 4.5 tonight takes 50%
    // (1 + 5.59 − 1.86 = 4.73); kept all week, 50% climbs 3.73 ppm a day to 27 ppm by day 7.
    // Instead: 60% for a day (1 + 6.71 − 1.86 = 5.85), then 15% (1.68 − 1.86 = −0.18 a day),
    // which stays inside the band and above the floor all week.
    const low = planWeek({ ...salt, water: { ...salt.water, fc: 1 } })!;
    expect(low.swgStart).toEqual({ percent: 60, until: "2026-10-02" });
    expect(low.swgPercent).toBe(15);
    expect(low.days.map((d) => d.fcEnd)).toEqual([5.85, 5.67, 5.49, 5.3, 5.12, 4.94, 4.76]);
    expect(low.days.every((d) => d.fcEnd >= low.floor)).toBe(true);
  });

  it("runs a cell with set levels at its top setting when it cannot keep up", () => {
    const small = planWeek({ ...salt, pool: { ...salt.pool, cellPpmPerDay: 1, cellLevels: [20, 40, 60, 80, 100] } })!;
    expect(small.swgPercent).toBe(100);
    expect(small.capped).toBe(true);
  });

  it("dilutes salt in heavy rain", () => {
    const wet = planWeek({ ...salt, days: [day(1, STORM)] })!;
    // 3200 × (1 − 0.03276) = 3095.
    expect(wet.days[0].dilution).toEqual({ percent: 3.3, cya: 68, ch: 290, salt: 3095 });
  });

  it("gives the daily need when the cell's output is unknown", () => {
    const unknown = planWeek({ ...salt, pool: { ...salt.pool, cellPpmPerDay: null } })!;
    expect(unknown.swgPercent).toBeNull();
    expect(unknown.swgNeedPpm).toBeCloseTo(1.86, 2);
    expect(unknown.days.some((d) => d.algaeRisk)).toBe(false);
  });

  it("runs the cell at 100% and flags a week it cannot keep up with", () => {
    const small = planWeek({ ...salt, pool: { ...salt.pool, cellPpmPerDay: 1 } })!;
    expect(small.swgPercent).toBe(100);
    expect(small.capped).toBe(true);
    expect(small.days.some((d) => d.algaeRisk)).toBe(true);
  });
});

describe("planWeek from a time late in the day", () => {
  it("takes only the rest of today's use off FC now (worked numbers)", () => {
    // 11 PM: 1/24 of the day left. FC now 5: day 1 uses 2.36 / 24 = 0.10, ending at 4.90,
    // above the 4.5 floor, so nothing tonight. Day 2: 4.5 + 2.36 − 4.90 = 1.96 → 2.0 ppm.
    const late = planWeek({ ...base, firstDayShare: 1 / 24 })!;
    expect(late.days[0].addPpm).toBe(0);
    expect(late.days[0].lossPpm).toBeCloseTo(2.36 / 24, 2);
    expect(late.days[0].fcEnd).toBeCloseTo(5 - 2.36 / 24, 2);
    expect(late.days[1].addPpm).toBe(2);
    // From midnight (the default), the whole day's use is ahead: 4.5 + 2.36 − 5 = 1.86 → 2.0 tonight.
    expect(planWeek(base)!.days[0].addPpm).toBe(2);
  });

  it("scales a salt cell's first-day output with the day left, and keeps the daily need whole", () => {
    const cell = (1.4 * 453.592 * 1000) / 56781;
    const salt: PlanInput = {
      ...base,
      pool: { ...base.pool, swg: true, cellPpmPerDay: cell },
      water: { fc: 5, cya: 70, ch: 300, salt: 3200 },
      days: [1, 2, 3, 4, 5, 6, 7].map((n) => day(n, SUNNY)),
      firstDayShare: 0.5,
    };
    const plan = planWeek(salt)!;
    expect(plan.swgNeedPpm).toBeCloseTo(1.86, 2);
    // Day 1 at 20% for half a day: 5 + (11.18 × 0.2 − 1.86) × 0.5 = 5.19.
    expect(plan.days[0].fcEnd).toBeCloseTo(5 + (cell * 0.2 - 1.86) * 0.5, 1);
    expect(plan.days.every((d) => d.fcEnd >= plan.floor)).toBe(true);
  });

  it("does not ask a salt cell to reach the floor in the hour left (worked numbers)", () => {
    const cell = (1.4 * 453.592 * 1000) / 56781; // 11.18 ppm/day at 100%
    const salt: PlanInput = {
      ...base,
      pool: { ...base.pool, swg: true, cellPpmPerDay: cell },
      water: { fc: 4, cya: 70, ch: 300, salt: 3200 },
      days: [1, 2, 3, 4, 5, 6, 7].map((n) => day(n, SUNNY)),
    };
    // FC 4.0 at 11 PM, floor 4.5, 1.86 ppm/day used. Tonight has to make 1/24 of the way:
    // 4.0 + 0.5 / 24 = 4.021. 20%: 4.0 + (2.236 − 1.86) / 24 = 4.016, short; 25%: 4.0 +
    // (2.795 − 1.86) / 24 = 4.039, then +0.94 a day. Reaching 4.5 by midnight would take 100%.
    const late = planWeek({ ...salt, firstDayShare: 1 / 24 })!;
    expect(late.swgPercent).toBe(25);
    expect(late.capped).toBe(false);
    expect(late.days[0].fcEnd).toBeCloseTo(4.04, 2);
    expect(late.days.slice(1).every((d) => d.fcEnd >= late.floor)).toBe(true);
    // From midnight the whole day is ahead, and the same setting is needed: 4.0 + 0.935 = 4.94.
    expect(planWeek(salt)!.swgPercent).toBe(25);
  });

  it("exports the floor it plans to", () => {
    expect(planFloor({ min: 3, targetLow: 5, targetHigh: 7, slam: 16 }, 0)).toBe(4.5);
    expect(planFloor({ min: 3, targetLow: 5, targetHigh: 7, slam: 16 }, 4)).toBe(4);
  });
});
