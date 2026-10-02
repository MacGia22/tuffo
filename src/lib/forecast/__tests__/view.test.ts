import { describe, expect, it } from "vitest";
import { DEFAULT_PRIOR, FEATURES, planWeek, type PlanForecastDay } from "@/engine";
import type { ForecastInput } from "../params";
import { typicalCellPpmPerDay, typicalStartFc } from "../typical";
import {
  buildForecastView,
  chlorineUseLevel,
  liquidChlorine,
  rainText,
  roundTo,
  temperatureText,
  whyLine,
  type ForecastDayView,
} from "../view";

describe("display rounding", () => {
  it("rounds daily use to 0.5 ppm", () => {
    expect(roundTo(2.26, 0.5)).toBe(2.5);
    expect(roundTo(2.24, 0.5)).toBe(2);
    expect(roundTo(0.2, 0.5)).toBe(0);
  });

  it("gives liquid chlorine 12.5% to the nearest 0.25 qt or 0.25 L, never 0 when something is needed", () => {
    // 3 ppm × 56,781 L ÷ 125 mg/mL = 1,362.7 mL = 1.44 qt → 1.5 qt
    expect(liquidChlorine(3, 56_781, "us")).toBe("1.5 qt");
    // 3 ppm × 57,000 L ÷ 125 = 1,368 mL = 1.37 L → 1.25 L
    expect(liquidChlorine(3, 57_000, "metric")).toBe("1.25 L");
    // 0.5 ppm × 10,000 L ÷ 125 = 40 mL: shown as the smallest step
    expect(liquidChlorine(0.5, 10_000, "us")).toBe("0.25 qt");
    expect(liquidChlorine(0, 56_781, "us")).toBeNull();
  });

  it("gives rain to 0.1 in or 1 mm, and nothing for a trace", () => {
    expect(rainText(35.56, "us")).toBe("1.4 in");
    expect(rainText(35.56, "metric")).toBe("36 mm");
    expect(rainText(1, "us")).toBeNull();
    expect(rainText(0.4, "metric")).toBeNull();
    expect(rainText(null, "us")).toBeNull();
  });

  it("converts temperature at the edge", () => {
    expect(temperatureText(31.1, "us")).toBe("88 °F");
    expect(temperatureText(31.1, "metric")).toBe("31 °C");
    expect(temperatureText(null, "us")).toBeNull();
  });

  it("calls the week's use low, normal or high", () => {
    // Against 2.36 ppm on a clear 90 °F day (CYA 40): under 1.18 low, 2.0 and up high
    expect(chlorineUseLevel(1.1, 2.36)).toBe("low");
    expect(chlorineUseLevel(1.8, 2.36)).toBe("normal");
    expect(chlorineUseLevel(2.1, 2.36)).toBe("high");
    expect(chlorineUseLevel(2.1, 0)).toBe("normal");
  });
});

describe("typical salt cell", () => {
  it("is rated for 1.5 times the pool and runs 12 hours a day", () => {
    // 15,000 gal: 0.8325 lb/day = 377.6 g/day; ÷ 56,781 L = 6.65 ppm a day at 24 h; half that at 12 h
    expect(typicalCellPpmPerDay(56_781)).toBeCloseTo(3.33, 2);
  });
});

function day(over: Partial<ForecastDayView>): ForecastDayView {
  return {
    date: "2026-10-05",
    day: "Mon",
    dayLong: "Monday",
    label: "Oct 5",
    uv: 5,
    high: "85 °F",
    rainfall: null,
    rainNote: "Dry",
    today: false,
    usePpm: 2,
    useText: "2.0 ppm",
    fcEvening: null,
    add: null,
    algaeRisk: false,
    dilutionPercent: null,
    cyaAfter: null,
    ...over,
  };
}

describe("whyLine", () => {
  const names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const week = (uv: number[], rain: Record<number, { rainfall: string; dilutionPercent: number }> = {}) =>
    uv.map((u, i) => day({ dayLong: names[i], uv: u, ...(rain[i] ?? {}) }));

  it("names a run of strong-sun days and the rain that dilutes stabilizer", () => {
    expect(whyLine(week([10, 9, 9, 4, 6, 5, 6], { 3: { rainfall: "1.4 in", dilutionPercent: 5 } }), 0.6)).toBe(
      "Strong sun Monday to Wednesday burns most of it; Thursday's 1.4 in of rain dilutes stabilizer about 5%.",
    );
  });

  it("counts scattered strong days, or says the sun is mild", () => {
    expect(whyLine(week([9, 4, 9, 4, 9, 4, 4]), 0.4)).toBe("Strong sun on 3 of 7 days uses the most.");
    expect(whyLine(week([9, 4, 4, 4, 4, 4, 4]), 0.4)).toBe("Strong sun on Monday uses the most.");
    expect(whyLine(week([3, 3, 3, 3, 3, 3, 3]), 0.2)).toBe("Mild sun keeps chlorine use down.");
    expect(whyLine(week([5, 5, 5, 5, 5, 5, 5]), 0.45)).toBeNull();
  });
});

const input: ForecastInput = {
  place: "Tampa, Florida, US",
  lat: 27.96,
  lon: -82.47,
  volumeL: 56_781,
  cya: 40,
  sanitizer: "chlorine",
  units: "us",
};

// A hot, sunny Florida week with a wet Thursday.
const weather = [
  { date: "2026-10-05", uvIndexMax: 9.4, tmaxC: 32.2, rainMm: 0, sunshineHours: 11 },
  { date: "2026-10-06", uvIndexMax: 9.1, tmaxC: 32.8, rainMm: 0, sunshineHours: 11 },
  { date: "2026-10-07", uvIndexMax: 8.6, tmaxC: 31.7, rainMm: 0.3, sunshineHours: 10 },
  { date: "2026-10-08", uvIndexMax: 4.2, tmaxC: 28.3, rainMm: 35.6, sunshineHours: 2 },
  { date: "2026-10-09", uvIndexMax: 6.5, tmaxC: 30, rainMm: 2, sunshineHours: 7 },
  { date: "2026-10-10", uvIndexMax: 7.2, tmaxC: 30.6, rainMm: 0, sunshineHours: 9 },
  { date: "2026-10-11", uvIndexMax: 7.2, tmaxC: 31.1, rainMm: 0, sunshineHours: 9 },
];
const days: PlanForecastDay[] = weather.map((w) => ({
  date: w.date,
  weather: { uvIndexMax: w.uvIndexMax, sunshineHours: w.sunshineHours, shortwaveMj: null, tmaxC: w.tmaxC, rainMm: w.rainMm },
}));

function viewFor(over: Partial<ForecastInput> = {}) {
  const i = { ...input, ...over };
  const swg = i.sanitizer === "salt";
  const plan = planWeek({
    coefficients: DEFAULT_PRIOR.mean,
    pairs: 0,
    pool: { volumeL: i.volumeL, surfaceAreaM2: null, swg, covered: false, surface: "plaster", cellPpmPerDay: swg ? typicalCellPpmPerDay(i.volumeL) : null },
    water: { fc: typicalStartFc(swg, i.cya), cya: i.cya, ch: null, salt: null },
    days,
  });
  if (!plan) throw new Error("no plan");
  return { plan, view: buildForecastView({ input: i, plan, weather, sunShare: 0.6, summerDayPpm: 2.36, cellText: "a typical cell" }) };
}

describe("buildForecastView", () => {
  it("shows a typical chlorine pool's week in display units", () => {
    const { view } = viewFor();
    expect(view.weekOfLabel).toBe("Oct 5");
    expect(view.volume).toBe("15,000 gal");
    expect(view.days).toHaveLength(7);
    expect(view.days[0]).toMatchObject({ day: "Mon", dayLong: "Monday", uv: 9, high: "90 °F", rainfall: null });
    // Monday: 0.5 + 0.45 × (9.4 × 11/12) / 3 + 0.05 × 7.2 = 2.15 ppm → shown as 2
    expect(view.days[0].usePpm).toBe(2);
    // Thursday: 35.6 mm on 37.9 m² (56.8 m³ at 1.5 m deep) = 1,348 L, 2.3% of the water; CYA 40 → 39
    expect(view.days[3]).toMatchObject({ rainfall: "1.4 in", dilutionPercent: 2, cyaAfter: 39 });
    expect(view.level).toBe("normal");
    expect(view.why).toBe("Strong sun Monday to Wednesday burns most of it; Thursday's 1.4 in of rain dilutes stabilizer about 2%.");
    expect(view.target).toEqual({ min: 3, low: 5, high: 7 });
    expect(view.salt).toBeNull();
  });

  it("marks today, gives each day's rain with its chance, and the week's chlorine", () => {
    const { plan, view } = viewFor();
    expect(view.days.map((d) => d.today)).toEqual([true, false, false, false, false, false, false]);
    expect(view.days[0].rainNote).toBe("Dry");
    expect(view.days[3].rainNote).toBe("1.4 in");
    expect(view.days[0].useText).toBe("2.1 ppm"); // 2.149… to 0.1
    // The plan's evening level, rounded: what the card shows as "FC by evening".
    expect(view.days[0].fcEvening).toBe(`≈ ${(Math.round(plan.days[0].fcEnd * 10) / 10).toFixed(1)}`);
    // The week's additions together: Σ addPpm × 56,781 L ÷ 125 mg/mL, in quarts to 0.25.
    const ppm = plan.days.reduce((sum, d) => sum + d.addPpm, 0);
    const qt = Math.round(((ppm * 56_781) / 125 / 946.352946) * 4) / 4;
    expect(view.weekAdd).toBe(`${qt.toLocaleString("en-US")} qt`);
    expect(view.startPpm).toBe(5);
  });

  it("rounds every displayed number", () => {
    const { view } = viewFor();
    for (const d of view.days) {
      expect(Number.isInteger(d.usePpm * 2)).toBe(true);
      if (d.add) expect(d.add).toMatch(/^\d+(\.(25|5|75))? qt$/);
      if (d.uv !== null) expect(Number.isInteger(d.uv)).toBe(true);
    }
    expect(Number.isInteger(view.useLow * 2) && Number.isInteger(view.useHigh * 2)).toBe(true);
  });

  it("gives a salt pool the cell's daily need and a typical setting", () => {
    const { view, plan } = viewFor({ sanitizer: "salt" });
    expect(view.days.every((d) => d.add === null)).toBe(true);
    expect(view.salt?.needPpm).toBe(roundTo(plan.swgNeedPpm ?? 0, 0.5));
    expect(view.salt?.percent).toBe(plan.swgPercent);
    expect(view.salt?.cell).toBe("a typical cell");
  });

  it("starts a salt pool at the plan's floor, so the setting matches the daily need", () => {
    // Salt, CYA 40: target 3–4.5, floor max(2 + 1, 3 − 1) + 0.5 = 3.5. Chlorine, CYA 40: the bottom of 5–7.
    expect(typicalStartFc(true, 40)).toBe(3.5);
    expect(typicalStartFc(false, 40)).toBe(5);
    const { plan } = viewFor({ sanitizer: "salt" });
    const cell = typicalCellPpmPerDay(input.volumeL);
    // From the floor, the setting only has to cover the week's use, not catch up 0.5 ppm on day one.
    const fromBottom = planWeek({
      coefficients: DEFAULT_PRIOR.mean,
      pairs: 0,
      pool: { volumeL: input.volumeL, surfaceAreaM2: null, swg: true, covered: false, surface: "plaster", cellPpmPerDay: cell },
      water: { fc: 3, cya: 40, ch: null, salt: null },
      days,
    })!;
    expect(plan.swgPercent!).toBeLessThan(fromBottom.swgPercent!);
    // The lowest 5% step whose output covers the mean need, give or take the week's day-to-day swing.
    expect(plan.swgPercent!).toBeLessThanOrEqual(Math.ceil((plan.swgNeedPpm! / cell) * 20) * 5 + 10);
  });

  it("shows a spa's volume as typed, not rounded to 100", () => {
    expect(viewFor({ volumeL: 450 * 3.785411784 }).view.volume).toBe("450 gal");
    expect(viewFor({ volumeL: 15_140 * 3.785411784 }).view.volume).toBe("15,100 gal");
  });

  it("uses liters and mm for metric", () => {
    const { view } = viewFor({ units: "metric", volumeL: 57_000 });
    expect(view.volume).toBe("57,000 L");
    expect(view.days[3].rainfall).toBe("36 mm");
    expect(view.days[0].high).toBe("32 °C");
    expect(view.days.find((d) => d.add)?.add).toMatch(/ L$/);
  });

  it("carries no model coefficients, priors or raw plan fields to the page", () => {
    const { view } = viewFor();
    const keys = new Set<string>();
    const walk = (value: unknown) => {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === "object")
        for (const [k, v] of Object.entries(value)) {
          keys.add(k);
          walk(v);
        }
    };
    walk(view);
    for (const forbidden of [...FEATURES, "coefficients", "prior", "mean", "sd", "noiseSd", "lossPpm", "fcEnd", "fcAfterAdd", "floor", "addPpm", "pairs", "confidence"]) {
      expect(keys.has(forbidden), forbidden).toBe(false);
    }
  });
});
