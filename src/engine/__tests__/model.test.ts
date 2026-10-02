import { describe, expect, it } from "vitest";
import {
  sunShareFrom,
  cyaShield,
  dayDrivers,
  DEFAULT_PRIOR,
  FEATURES,
  fitChlorineModel,
  parseStoredCoefficients,
  populationPrior,
  predictLoss,
  predictNextFc,
  REFERENCE_SUNNY_DAY,
  solveLinear,
  storedCoefficients,
  uvDose,
  type Coefficients,
  type Drivers,
  type Observation,
  type Prior,
} from "../model";

/** Deterministic pseudo-random numbers (mulberry32), so the synthetic data is the same every run. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal from two uniforms (Box-Muller). */
function normal(rand: () => number): number {
  return Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
}

const TRUE: Coefficients = { base: 0.8, sun: 0.35, heat: 0.08, rain: 0.3, use: 1.5 };

/** Intervals of 1-4 days under varied weather, CYA and use, with loss from TRUE plus noise. */
function synthetic(count: number, noiseSd: number, seed = 7, truth: Coefficients = TRUE): Observation[] {
  const rand = rng(seed);
  const out: Observation[] = [];
  for (let i = 0; i < count; i += 1) {
    const drivers = dayDrivers(
      {
        uvIndexMax: 3 + rand() * 8,
        sunshineHours: 2 + rand() * 11,
        shortwaveMj: null,
        tmaxC: 18 + rand() * 18,
        rainMm: rand() < 0.3 ? rand() * 40 : 0,
      },
      { cya: 20 + rand() * 60, covered: false, heavyUse: rand() < 0.2 ? 1 : 0 },
    ) as Drivers;
    const lossPerDay = predictLoss(truth, drivers) + noiseSd * normal(rand);
    out.push({ drivers, lossPerDay, days: 1 + Math.floor(rand() * 4) });
  }
  return out;
}

/** A prior so loose it barely matters: the fit is then plain least squares. */
const LOOSE: Prior = {
  mean: DEFAULT_PRIOR.mean,
  sd: { base: 100, sun: 100, heat: 100, rain: 100, use: 100 },
  noiseSd: 0.6,
};

describe("drivers", () => {
  it("scales peak UV by the sunny share of a 12-hour day", () => {
    expect(uvDose({ uvIndexMax: 10, sunshineHours: 12, shortwaveMj: null, tmaxC: 30, rainMm: 0 })).toBe(10);
    expect(uvDose({ uvIndexMax: 10, sunshineHours: 6, shortwaveMj: 20, tmaxC: 30, rainMm: 0 })).toBe(5);
    expect(uvDose({ uvIndexMax: 10, sunshineHours: 14, shortwaveMj: null, tmaxC: 30, rainMm: 0 })).toBe(10);
  });

  it("falls back to solar radiation, then to UV alone", () => {
    expect(uvDose({ uvIndexMax: null, sunshineHours: null, shortwaveMj: 25, tmaxC: 30, rainMm: 0 })).toBe(10);
    expect(uvDose({ uvIndexMax: 10, sunshineHours: null, shortwaveMj: null, tmaxC: 30, rainMm: 0 })).toBe(8);
    expect(uvDose({ uvIndexMax: null, sunshineHours: null, shortwaveMj: null, tmaxC: 30, rainMm: 0 })).toBeNull();
  });

  it("lets stabilizer shield chlorine from the sun", () => {
    expect(cyaShield(0)).toBe(1);
    expect(cyaShield(20)).toBe(0.5);
    expect(cyaShield(40)).toBeCloseTo(1 / 3, 10);
    expect(cyaShield(80)).toBeCloseTo(0.2, 10);
  });

  it("builds a day's drivers: sun under a cover, heat above 25 °C, rain in cm", () => {
    const day = { uvIndexMax: 10, sunshineHours: 12, shortwaveMj: null, tmaxC: 32, rainMm: 15 };
    const open = dayDrivers(day, { cya: 40, covered: false, heavyUse: 1 }) as Drivers;
    const expected: Drivers = { base: 1, sun: 10 / 3, heat: 7, rain: 1.5, use: 1 };
    for (const f of FEATURES) expect(open[f]).toBeCloseTo(expected[f], 10);
    expect(dayDrivers(day, { cya: 40, covered: true, heavyUse: 0 })?.sun).toBeCloseTo(1 / 3, 10);
    expect(dayDrivers({ ...day, tmaxC: 20 }, { cya: 0, covered: false, heavyUse: 0 })?.heat).toBe(0);
    expect(dayDrivers({ ...day, tmaxC: null }, { cya: 40, covered: false, heavyUse: 0 })).toBeNull();
  });
});

describe("solveLinear", () => {
  it("solves a small system that needs pivoting", () => {
    const x = solveLinear(
      [
        [0, 2, 1],
        [1, 1, 1],
        [2, 1, 3],
      ],
      [7, 6, 13],
    );
    expect(x[0]).toBeCloseTo(1, 10);
    expect(x[1]).toBeCloseTo(2, 10);
    expect(x[2]).toBeCloseTo(3, 10);
  });
});

describe("fitChlorineModel", () => {
  it("is the prior when a pool has no test pairs", () => {
    const fit = fitChlorineModel([]);
    expect(fit.sampleCount).toBe(0);
    expect(fit.residual).toBeNull();
    for (const f of FEATURES) expect(fit.coefficients[f]).toBeCloseTo(DEFAULT_PRIOR.mean[f], 10);
  });

  it("recovers known coefficients from noise-free synthetic data", () => {
    const fit = fitChlorineModel(synthetic(60, 0), LOOSE);
    for (const f of FEATURES) expect(fit.coefficients[f]).toBeCloseTo(TRUE[f], 3);
    expect(fit.residual).toBeLessThan(1e-3);
  });

  it("recovers them within test-kit noise from 200 noisy pairs", () => {
    const fit = fitChlorineModel(synthetic(200, 0.3), LOOSE);
    expect(fit.coefficients.base).toBeCloseTo(TRUE.base, 0);
    expect(Math.abs(fit.coefficients.sun - TRUE.sun)).toBeLessThan(0.05);
    expect(Math.abs(fit.coefficients.heat - TRUE.heat)).toBeLessThan(0.02);
    expect(Math.abs(fit.coefficients.rain - TRUE.rain)).toBeLessThan(0.1);
    expect(Math.abs(fit.coefficients.use - TRUE.use)).toBeLessThan(0.3);
    expect(fit.residual).toBeGreaterThan(0.2);
    expect(fit.residual).toBeLessThan(0.4);
  });

  it("starts from the average pool and becomes its own as pairs accumulate", () => {
    // A pool in full sun that uses much more than average: 4.25 ppm on the reference day, against 2.36.
    const hungry: Coefficients = { base: 1.2, sun: 0.7, heat: 0.1, rain: 0.3, use: 1.5 };
    const reference = dayDrivers(REFERENCE_SUNNY_DAY, { cya: 40, covered: false, heavyUse: 0 }) as Drivers;
    const truth = predictLoss(hungry, reference);
    const prior = predictLoss(DEFAULT_PRIOR.mean, reference);
    expect(truth).toBeCloseTo(4.253, 2);
    const after = (n: number) => predictLoss(fitChlorineModel(synthetic(n, 0.3, 11, hungry)).coefficients, reference);

    // One pair moves it off the average without jumping all the way; by about three weeks
    // of tests (9 pairs) it is within 0.5 ppm of the pool's own figure; with 100, 0.25.
    expect(after(1)).toBeGreaterThan(prior + 0.3);
    expect(after(1)).toBeLessThan(truth);
    expect(Math.abs(after(9) - truth)).toBeLessThan(0.5);
    expect(Math.abs(after(100) - truth)).toBeLessThan(0.25);
  });

  it("never lets sun, heat, rain or use make chlorine", () => {
    // Loss falls as the sun rises: noise or a logging mistake, not physics.
    const observations: Observation[] = [0, 2, 4, 6, 8, 10].map((sun) => ({
      drivers: { base: 1, sun, heat: 0, rain: 0, use: 0 },
      lossPerDay: 3 - 0.2 * sun,
      days: 2,
    }));
    const fit = fitChlorineModel(observations, LOOSE);
    expect(fit.coefficients.sun).toBe(0);
    expect(fit.coefficients.base).toBeCloseTo(2, 1);
  });
});

describe("predictions", () => {
  it("predicts the next test from the level, the doses and the loss (worked numbers)", () => {
    // 1.0 base + 0.4 × 10/3 sun + 0.05 × 7 heat = 2.683 ppm/day; 5 + 4 added − 2 days × 2.683 = 3.63 ppm.
    const coefficients = { base: 1, sun: 0.4, heat: 0.05, rain: 0, use: 0 };
    const drivers = dayDrivers(
      { uvIndexMax: 10, sunshineHours: 12, shortwaveMj: null, tmaxC: 32, rainMm: 0 },
      { cya: 40, covered: false, heavyUse: 0 },
    ) as Drivers;
    expect(predictLoss(coefficients, drivers)).toBeCloseTo(2.6833, 3);
    expect(predictNextFc(coefficients, { fc: 5, addedPpm: 4, days: 2, drivers })).toBeCloseTo(3.633, 2);
    expect(predictNextFc(coefficients, { fc: 1, addedPpm: 0, days: 3, drivers })).toBe(0);
  });

  it("puts the default prior's sunny 90 °F day near 2.4 ppm at 40 ppm CYA", () => {
    const drivers = dayDrivers(REFERENCE_SUNNY_DAY, { cya: 40, covered: false, heavyUse: 0 }) as Drivers;
    // 0.5 + 0.45 × 10/3 + 0.05 × 7.2 = 2.36
    expect(predictLoss(DEFAULT_PRIOR.mean, drivers)).toBeCloseTo(2.36, 2);
  });
});

describe("populationPrior", () => {
  it("stays the default until pools have enough pairs", () => {
    expect(populationPrior([{ coefficients: TRUE, sampleCount: 3 }])).toBe(DEFAULT_PRIOR);
  });

  it("blends fitted pools into the default, weighted by their data", () => {
    const prior = populationPrior([
      { coefficients: { ...TRUE, base: 1.0 }, sampleCount: 10 },
      { coefficients: { ...TRUE, base: 2.0 }, sampleCount: 30 },
    ]);
    // Fitted mean 1.75, two pools against the default's weight of five: (0.5 × 5 + 1.75 × 2) / 7.
    expect(prior.mean.base).toBeCloseTo(6 / 7, 10);
    expect(prior.sd).toEqual(DEFAULT_PRIOR.sd);
  });
});

describe("stored coefficients", () => {
  it("round-trips through JSON", () => {
    const fit = fitChlorineModel(synthetic(10, 0.3));
    const back = parseStoredCoefficients(JSON.parse(JSON.stringify(storedCoefficients(fit, 21))));
    expect(back?.coefficients).toEqual(fit.coefficients);
    expect(back?.spanDays).toBe(21);
  });

  it("ignores rows from another model version or with missing numbers", () => {
    expect(parseStoredCoefficients({})).toBeNull();
    expect(parseStoredCoefficients({ version: 99, beta: TRUE })).toBeNull();
    expect(parseStoredCoefficients({ version: 1, beta: { ...TRUE, sun: "x" } })).toBeNull();
  });
});

describe("sunShareFrom", () => {
  it("turns the enclosure percent into the model's sun share", () => {
    expect(sunShareFrom(null)).toBe(1);
    expect(sunShareFrom(70)).toBe(0.7);
    expect(sunShareFrom(150)).toBe(1);
    expect(sunShareFrom(1)).toBe(0.05);
  });
});

