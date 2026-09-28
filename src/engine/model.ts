/**
 * Chlorine-consumption model, version 1: how many ppm of free chlorine a pool loses per
 * day, as a sum of drivers the weather and the owner's log provide.
 *
 *   loss per day = base
 *                + sun  × UV dose × CYA shield × (open water share)
 *                + heat × degrees of daily high above 25 °C
 *                + rain × centimetres of rain
 *                + use  × heavy-use events per day
 *
 * Each pool gets its own coefficients from its test pairs, fitted by ridge regression
 * towards a population prior: with no data a pool is the average pool, and after a few
 * weeks of tests its own numbers dominate. Pure functions; no I/O.
 */

export const MODEL_VERSION = 1;

export const FEATURES = ["base", "sun", "heat", "rain", "use"] as const;
export type Feature = (typeof FEATURES)[number];
export type Coefficients = Record<Feature, number>;
/** One value per feature, in FEATURES order when used as a vector. */
export type Drivers = Coefficients;

/** Daily highs above this add heat-driven demand. */
export const HEAT_BASE_C = 25;
/** CYA (ppm) at which half the sun loss is prevented. */
export const CYA_HALF_SHIELD = 20;
/** Share of sun a pool cover lets through to the chlorine. */
export const COVER_SUN_SHARE = 0.1;
/** Stabilizer assumed when the pool has never been tested for it. */
export const DEFAULT_CYA = 40;

export interface WeatherDrivers {
  uvIndexMax: number | null;
  sunshineHours: number | null;
  shortwaveMj: number | null;
  tmaxC: number | null;
  rainMm: number | null;
}

/**
 * A day's UV dose on a scale where a clear, long summer day is about 10: the peak UV
 * index scaled by the share of a 12-hour day that was sunny. Falls back to solar
 * radiation (25 MJ/m² ≈ 10) or the UV index alone. Null when nothing is known.
 */
export function uvDose(day: WeatherDrivers): number | null {
  if (day.uvIndexMax !== null && day.sunshineHours !== null) {
    return day.uvIndexMax * Math.min(1, Math.max(0, day.sunshineHours) / 12);
  }
  if (day.shortwaveMj !== null) return Math.max(0, day.shortwaveMj) * 0.4;
  if (day.uvIndexMax !== null) return day.uvIndexMax * 0.8;
  return null;
}

/** Share of sun loss that stabilizer does not prevent: 1 at 0 ppm, 1/3 at 40 ppm. */
export function cyaShield(cya: number): number {
  return 1 / (1 + Math.max(0, cya) / CYA_HALF_SHIELD);
}

export interface PoolState {
  /** Stabilizer, ppm. */
  cya: number;
  /** Cover on for the day. */
  covered: boolean;
  /** Heavy-use events logged that day. */
  heavyUse: number;
}

/** The drivers for one day, or null when the weather for it is unknown. */
export function dayDrivers(day: WeatherDrivers, state: PoolState): Drivers | null {
  const dose = uvDose(day);
  if (dose === null || day.tmaxC === null) return null;
  return {
    base: 1,
    sun: dose * cyaShield(state.cya) * (state.covered ? COVER_SUN_SHARE : 1),
    heat: Math.max(0, day.tmaxC - HEAT_BASE_C),
    rain: Math.max(0, day.rainMm ?? 0) / 10,
    use: Math.max(0, state.heavyUse),
  };
}

export interface Observation {
  /** Mean drivers over the interval between two tests. */
  drivers: Drivers;
  /** Observed free chlorine lost per day over the interval, ppm. */
  lossPerDay: number;
  /** Length of the interval in days; longer intervals weigh more (up to a week). */
  days: number;
}

export interface Prior {
  mean: Coefficients;
  /** Standard deviation of each coefficient across pools. */
  sd: Coefficients;
  /** Typical error of one observed daily loss, ppm/day (test resolution plus model error). */
  noiseSd: number;
}

/**
 * Starting point before any pool has data: a manually chlorinated pool at 40 ppm CYA
 * loses about 0.5 ppm a day at night and from organics, about 1.5 more on a clear
 * summer day, a little more in heat and rain, and about 1 ppm after a pool party.
 */
export const DEFAULT_PRIOR: Prior = {
  mean: { base: 0.5, sun: 0.45, heat: 0.05, rain: 0.1, use: 1.0 },
  sd: { base: 0.4, sun: 0.3, heat: 0.05, rain: 0.15, use: 1.0 },
  noiseSd: 0.6,
};

/** Coefficients that cannot be negative: chlorine is not made by sun, heat, rain or swimmers. */
const NON_NEGATIVE: Feature[] = ["sun", "heat", "rain", "use"];

export interface Fit {
  version: number;
  coefficients: Coefficients;
  /** Test pairs used. */
  sampleCount: number;
  /** Weighted root-mean-square error of the fitted daily loss, ppm/day; null without data. */
  residual: number | null;
}

/** Solves A x = b for a small dense system (Gaussian elimination with partial pivoting). */
export function solveLinear(a: number[][], b: number[]): number[] {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row;
    }
    if (Math.abs(m[pivot][col]) < 1e-12) throw new Error("singular system");
    [m[col], m[pivot]] = [m[pivot], m[col]];
    for (let row = col + 1; row < n; row += 1) {
      const f = m[row][col] / m[col][col];
      for (let k = col; k <= n; k += 1) m[row][k] -= f * m[col][k];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let row = n - 1; row >= 0; row -= 1) {
    let sum = m[row][n];
    for (let k = row + 1; k < n; k += 1) sum -= m[row][k] * x[k];
    x[row] = sum / m[row][row];
  }
  return x;
}

function observationWeight(o: Observation): number {
  return Math.min(Math.max(o.days, 0), 7);
}

/**
 * Posterior-mean fit: minimises Σ wᵢ (yᵢ − xᵢ·β)² / σ² + Σⱼ (βⱼ − μⱼ)² / sdⱼ², with the
 * weather and use coefficients kept at zero or above (a coefficient that comes out
 * negative is pinned to zero and the rest refitted).
 */
export function fitChlorineModel(observations: Observation[], prior: Prior = DEFAULT_PRIOR): Fit {
  const usable = observations.filter((o) => Number.isFinite(o.lossPerDay) && observationWeight(o) > 0);
  const noiseVar = prior.noiseSd ** 2;
  const pinned = new Set<Feature>();
  let beta: Coefficients = { ...prior.mean };

  for (let round = 0; round <= NON_NEGATIVE.length; round += 1) {
    const free = FEATURES.filter((f) => !pinned.has(f));
    const n = free.length;
    const a = free.map(() => new Array<number>(n).fill(0));
    const b = new Array<number>(n).fill(0);

    for (let i = 0; i < n; i += 1) {
      const precision = 1 / prior.sd[free[i]] ** 2;
      a[i][i] += precision;
      b[i] += precision * prior.mean[free[i]];
    }
    for (const o of usable) {
      const w = observationWeight(o) / noiseVar;
      // Pinned coefficients are zero, so they contribute nothing to the prediction.
      for (let i = 0; i < n; i += 1) {
        const xi = o.drivers[free[i]];
        b[i] += w * xi * o.lossPerDay;
        for (let j = 0; j < n; j += 1) a[i][j] += w * xi * o.drivers[free[j]];
      }
    }

    const solved = solveLinear(a, b);
    beta = Object.fromEntries(FEATURES.map((f) => [f, 0])) as Coefficients;
    free.forEach((f, i) => {
      beta[f] = solved[i];
    });
    const negative = NON_NEGATIVE.filter((f) => !pinned.has(f) && beta[f] < 0);
    if (negative.length === 0) break;
    for (const f of negative) pinned.add(f);
  }

  let residual: number | null = null;
  if (usable.length > 0) {
    let sum = 0;
    let weights = 0;
    for (const o of usable) {
      const w = observationWeight(o);
      sum += w * (o.lossPerDay - dot(beta, o.drivers)) ** 2;
      weights += w;
    }
    residual = Math.sqrt(sum / weights);
  }

  return { version: MODEL_VERSION, coefficients: beta, sampleCount: usable.length, residual };
}

function dot(beta: Coefficients, drivers: Drivers): number {
  return FEATURES.reduce((sum, f) => sum + beta[f] * drivers[f], 0);
}

/** Predicted free chlorine loss for a day (or the mean drivers of several), ppm/day, never below 0. */
export function predictLoss(coefficients: Coefficients, drivers: Drivers): number {
  return Math.max(0, dot(coefficients, drivers));
}

/**
 * Free chlorine expected at the next test: the level after the last test, plus what the
 * logged doses added, minus the predicted loss over the interval; never below 0.
 */
export function predictNextFc(
  coefficients: Coefficients,
  start: { fc: number; addedPpm: number; days: number; drivers: Drivers },
): number {
  return Math.max(0, start.fc + start.addedPpm - predictLoss(coefficients, start.drivers) * start.days);
}

/** Pools with at least this many test pairs shape the population prior. */
export const POPULATION_MIN_PAIRS = 6;
/** The default prior counts as this many pools when blending in fitted pools. */
const DEFAULT_PRIOR_WEIGHT = 5;

/**
 * Population prior from fitted pools: the mean of their coefficients weighted by how
 * much data each has, blended with the default so a handful of pools cannot swing it.
 * The spread (sd) stays the default's: it describes how pools differ, which a few
 * beta pools do not measure well yet.
 */
export function populationPrior(
  fits: { coefficients: Coefficients; sampleCount: number }[],
  base: Prior = DEFAULT_PRIOR,
): Prior {
  const eligible = fits.filter((f) => f.sampleCount >= POPULATION_MIN_PAIRS);
  if (eligible.length === 0) return base;
  const totalPairs = eligible.reduce((sum, f) => sum + f.sampleCount, 0);
  const mean = { ...base.mean };
  for (const feature of FEATURES) {
    const fitted = eligible.reduce((sum, f) => sum + f.coefficients[feature] * f.sampleCount, 0) / totalPairs;
    mean[feature] = (base.mean[feature] * DEFAULT_PRIOR_WEIGHT + fitted * eligible.length) / (DEFAULT_PRIOR_WEIGHT + eligible.length);
  }
  return { ...base, mean };
}

/** A clear summer day at 32 °C (90 °F): UV 10, 12 hours of sun, no rain, no crowd. */
export const REFERENCE_SUNNY_DAY: WeatherDrivers = {
  uvIndexMax: 10,
  sunshineHours: 12,
  shortwaveMj: null,
  tmaxC: 32.2,
  rainMm: 0,
};

/** Reads stored coefficients back, or null when they are missing or from another model version. */
export function parseStoredCoefficients(value: unknown): { coefficients: Coefficients; spanDays: number | null } | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.version !== MODEL_VERSION) return null;
  const raw = record.beta as Record<string, unknown> | undefined;
  if (!raw) return null;
  const coefficients = {} as Coefficients;
  for (const f of FEATURES) {
    const v = raw[f];
    if (typeof v !== "number" || !Number.isFinite(v)) return null;
    coefficients[f] = v;
  }
  const span = record.spanDays;
  return { coefficients, spanDays: typeof span === "number" && Number.isFinite(span) ? span : null };
}

/** The JSON stored in pool_models.coefficients. */
export function storedCoefficients(fit: Fit, spanDays: number | null) {
  return { version: fit.version, beta: fit.coefficients, spanDays };
}
