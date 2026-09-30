import { dayDrivers, DEFAULT_CYA, predictLoss, type Coefficients, type WeatherDrivers } from "./model";
import { targetsFor, type FcRange } from "./targets";

/**
 * The 7-day plan: free chlorine simulated day by day over the forecast with the pool's
 * chlorine model, and the smallest addition (or salt-cell output) each day that keeps
 * it above a floor inside the CYA-based range. Flags algae-risk days and rain heavy
 * enough to dilute stabilizer, calcium and salt. Pure; no I/O.
 *
 * Each day: the addition goes in (evening before, or morning), then the day's predicted
 * loss comes off. FC at the end of the day is what the floor is checked against.
 */

export const PLAN_VERSION = 1;

/** Below this many test pairs the pool's model is still mostly the typical pool's. */
export const PLAN_OWN_MODEL_PAIRS = 4;
/** Kept above the minimum at the end of each day. */
export const PLAN_MARGIN_PPM = 1;
/** Extra margin while the plan runs on typical-pool numbers. */
export const PLAN_TYPICAL_EXTRA_PPM = 0.5;
/** Largest single chlorine addition the plan suggests, ppm: more is a SLAM, not a plan. */
export const PLAN_MAX_ADDITION_PPM = 8;
/** Additions are rounded up to this step, ppm. */
const STEP_PPM = 0.25;
/** The smallest addition worth measuring out, ppm. */
const MIN_ADDITION_PPM = 0.5;
/** Salt-cell output is suggested in steps of this many percent. */
const SWG_STEP_PERCENT = 5;
/** Average depth assumed when the pool's surface area is not known, metres. */
export const ASSUMED_DEPTH_M = 1.5;
/** Rain that replaces at least this share of the water is flagged. */
export const DILUTION_FLAG = 0.02;

export interface PlanPool {
  volumeL: number;
  surfaceAreaM2: number | null;
  swg: boolean;
  covered: boolean;
  surface: "plaster" | "vinyl" | "fiberglass";
  /** The salt cell's output at 100%, ppm of FC per day in this pool; null when unknown. */
  cellPpmPerDay: number | null;
}

export interface PlanWater {
  /** Free chlorine at the start of the first day, ppm. */
  fc: number;
  cya: number | null;
  ch: number | null;
  salt: number | null;
}

export interface PlanForecastDay {
  date: string;
  weather: WeatherDrivers;
}

export interface PlanInput {
  coefficients: Coefficients;
  /** Test pairs behind the coefficients. */
  pairs: number;
  pool: PlanPool;
  water: PlanWater;
  days: PlanForecastDay[];
}

export interface Dilution {
  /** Share of the water replaced by rain that day, percent. */
  percent: number;
  /** Levels after the rain, cumulative over the week (null when never tested). */
  cya: number | null;
  ch: number | null;
  salt: number | null;
}

export interface PlanDay {
  date: string;
  /** Predicted free chlorine used that day, ppm. */
  lossPpm: number;
  /** Chlorine to add that day, ppm (0 for a salt pool running on its cell). */
  addPpm: number;
  /** FC right after the addition, and at the end of the day. */
  fcAfterAdd: number;
  fcEnd: number;
  /** FC would end the day below the minimum even following the plan. */
  algaeRisk: boolean;
  rainMm: number;
  dilution: Dilution | null;
  /** No forecast for this day: the loss is the week's average. */
  estimated: boolean;
}

export interface Plan {
  version: number;
  kind: "manual" | "swg";
  fc: FcRange;
  /** FC the plan keeps at or above at the end of each day. */
  floor: number;
  days: PlanDay[];
  /** Salt pools: suggested cell output, percent; null when the cell's output is unknown or it cannot keep up. */
  swgPercent: number | null;
  /** Salt pools: chlorine the cell has to make per day on average, ppm. */
  swgNeedPpm: number | null;
  /** The plan hit a limit (largest addition, or the cell at 100%) and FC may still run low. */
  capped: boolean;
  /** Without any chlorine from today, the first day FC would end below the minimum. */
  lowWithoutChlorine: string | null;
  confidence: "own" | "typical";
  pairs: number;
}

function roundUp(value: number, step: number): number {
  return Math.ceil(value / step - 1e-9) * step;
}

function round(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

/** Surface area, from the pool or from its volume at the assumed average depth. */
export function surfaceArea(pool: Pick<PlanPool, "volumeL" | "surfaceAreaM2">): number {
  return pool.surfaceAreaM2 && pool.surfaceAreaM2 > 0 ? pool.surfaceAreaM2 : pool.volumeL / 1000 / ASSUMED_DEPTH_M;
}

/**
 * Share of the water rain replaces, assuming the pool overflows or is lowered back to
 * its level: rain volume (depth × surface) over pool volume plus rain.
 */
export function rainDilution(rainMm: number, pool: Pick<PlanPool, "volumeL" | "surfaceAreaM2">): number {
  if (!(rainMm > 0)) return 0;
  const rainL = rainMm * surfaceArea(pool); // 1 mm on 1 m² is 1 L
  return rainL / (pool.volumeL + rainL);
}

export function planWeek(input: PlanInput): Plan | null {
  const { pool, water } = input;
  if (input.days.length === 0 || !Number.isFinite(water.fc)) return null;

  const cya = water.cya ?? DEFAULT_CYA;
  const targets = targetsFor({ swg: pool.swg, surface: pool.surface, cya });
  const fc = targets.fc;
  const confidence = input.pairs >= PLAN_OWN_MODEL_PAIRS ? "own" : "typical";
  const floor = Math.max(fc.min + PLAN_MARGIN_PPM, fc.targetLow - 1) + (confidence === "typical" ? PLAN_TYPICAL_EXTRA_PPM : 0);

  // Predicted loss per day; a day without weather takes the average of the others.
  const state = { cya, covered: pool.covered, heavyUse: 0 };
  const known = input.days.map((d) => {
    const drivers = dayDrivers(d.weather, state);
    return drivers ? predictLoss(input.coefficients, drivers) : null;
  });
  const knownLosses = known.filter((v): v is number => v !== null);
  if (knownLosses.length === 0) return null;
  const average = knownLosses.reduce((a, b) => a + b, 0) / knownLosses.length;
  const losses = known.map((v) => v ?? average);

  // Rain dilution, cumulative.
  let cyaLevel = water.cya;
  let chLevel = water.ch;
  let saltLevel = water.salt;
  const dilutions = input.days.map((d) => {
    const share = rainDilution(d.weather.rainMm ?? 0, pool);
    if (share > 0) {
      const keep = 1 - share;
      if (cyaLevel !== null) cyaLevel *= keep;
      if (chLevel !== null) chLevel *= keep;
      if (saltLevel !== null) saltLevel *= keep;
    }
    return share >= DILUTION_FLAG
      ? {
          percent: round(share * 100, 1),
          cya: cyaLevel === null ? null : Math.round(cyaLevel),
          ch: chLevel === null ? null : Math.round(chLevel),
          salt: saltLevel === null ? null : Math.round(saltLevel),
        }
      : null;
  });

  // Without any chlorine from today.
  let bare = water.fc;
  let lowWithoutChlorine: string | null = null;
  for (let i = 0; i < losses.length; i += 1) {
    bare = Math.max(0, bare - losses[i]);
    if (bare < fc.min) {
      lowWithoutChlorine = input.days[i].date;
      break;
    }
  }

  let capped = false;
  let swgPercent: number | null = null;
  let swgNeedPpm: number | null = null;
  const adds: number[] = [];

  if (!pool.swg) {
    // Each day, the smallest addition that ends the day at the floor; the first day
    // also brings FC up to the bottom of the target band.
    let level = water.fc;
    losses.forEach((loss, i) => {
      let need = floor + loss - level;
      if (i === 0) need = Math.max(need, fc.targetLow - level);
      let add = need > 0 ? Math.max(MIN_ADDITION_PPM, roundUp(need, STEP_PPM)) : 0;
      if (add > PLAN_MAX_ADDITION_PPM) {
        add = PLAN_MAX_ADDITION_PPM;
        capped = true;
      }
      adds.push(add);
      level = Math.max(0, level + add - loss);
    });
  } else {
    const days = losses.length;
    const mean = losses.reduce((a, b) => a + b, 0) / days;
    // The cell makes up the daily use, plus whatever FC is short of the band spread over the week.
    swgNeedPpm = round(mean + Math.max(0, fc.targetLow - water.fc) / days, 2);
    const cell = pool.cellPpmPerDay;
    if (cell && cell > 0) {
      const ends = (percent: number) => {
        let level = water.fc;
        return losses.map((loss) => (level = Math.max(0, level + (cell * percent) / 100 - loss)));
      };
      let chosen: number | null = null;
      for (let p = 0; p <= 100; p += SWG_STEP_PERCENT) {
        if (ends(p).every((v) => v >= floor)) {
          chosen = p;
          break;
        }
      }
      if (chosen === null) {
        chosen = 100;
        capped = true;
      }
      swgPercent = chosen;
      for (let i = 0; i < days; i += 1) adds.push(round((cell * chosen) / 100, 2));
    } else {
      // Unknown cell: show the week's use only.
      for (let i = 0; i < days; i += 1) adds.push(0);
    }
  }

  let level = water.fc;
  const planDays: PlanDay[] = input.days.map((d, i) => {
    const fcAfterAdd = level + adds[i];
    const fcEnd = Math.max(0, fcAfterAdd - losses[i]);
    level = fcEnd;
    const unknownCell = pool.swg && swgPercent === null;
    return {
      date: d.date,
      lossPpm: round(losses[i], 2),
      addPpm: pool.swg ? 0 : adds[i],
      fcAfterAdd: round(fcAfterAdd, 2),
      fcEnd: round(fcEnd, 2),
      algaeRisk: !unknownCell && fcEnd < fc.min,
      rainMm: round(d.weather.rainMm ?? 0, 1),
      dilution: dilutions[i],
      estimated: known[i] === null,
    };
  });

  return {
    version: PLAN_VERSION,
    kind: pool.swg ? "swg" : "manual",
    fc,
    floor: round(floor, 2),
    days: planDays,
    swgPercent,
    swgNeedPpm,
    capped,
    lowWithoutChlorine,
    confidence,
    pairs: input.pairs,
  };
}
