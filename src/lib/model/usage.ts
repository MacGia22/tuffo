import {
  DEFAULT_CYA,
  dayDrivers,
  parseStoredCoefficients,
  predictLoss,
  REFERENCE_SUNNY_DAY,
} from "@/engine/server";

/**
 * What the pool page says about the pool's own chlorine use: a daily figure for a
 * reference sunny day, never the coefficients behind it.
 */

/** Below this many test pairs the pool is still mostly the average pool; say nothing. */
export const MIN_PAIRS_TO_SHOW = 4;

export interface ChlorineUse {
  /** Free chlorine used on a clear 32 °C (90 °F) day, ppm. */
  sunnyDayPpm: number;
  pairs: number;
  spanDays: number | null;
  /** True when no stabilizer test exists and the default was assumed. */
  cyaAssumed: boolean;
}

export function chlorineUse(
  stored: { coefficients: unknown; sample_count: number } | null,
  pool: { cya: number | null; covered: boolean; sunShare?: number },
): ChlorineUse | null {
  if (!stored || stored.sample_count < MIN_PAIRS_TO_SHOW) return null;
  const parsed = parseStoredCoefficients(stored.coefficients);
  if (!parsed) return null;
  const drivers = dayDrivers(REFERENCE_SUNNY_DAY, { cya: pool.cya ?? DEFAULT_CYA, covered: pool.covered, heavyUse: 0, sunShare: pool.sunShare });
  if (!drivers) return null;
  return {
    sunnyDayPpm: Math.round(predictLoss(parsed.coefficients, drivers) * 10) / 10,
    pairs: stored.sample_count,
    spanDays: parsed.spanDays,
    cyaAssumed: pool.cya === null,
  };
}
