import { GRAMS_PER_POUND, LITERS_PER_US_GALLON } from "@/engine/server";

/**
 * The salt cell the public forecast assumes when it knows nothing about the visitor's:
 * rated for 1.5 times the pool's volume, with the pump running 12 hours a day.
 */
export const TYPICAL_CELL_SIZE = 1.5;
export const TYPICAL_CELL_HOURS = 12;
/** Rated output per 1,000 gal of rated pool size, lb/day (Hayward T-15: 1.47 lb for 40,000 gal). */
const LB_PER_DAY_PER_KGAL_RATED = 0.037;

/** That cell's output in this pool at 100%, ppm of free chlorine a day. */
export function typicalCellPpmPerDay(volumeL: number): number {
  const gallons = volumeL / LITERS_PER_US_GALLON;
  const lbPerDay = (gallons * TYPICAL_CELL_SIZE * LB_PER_DAY_PER_KGAL_RATED) / 1000;
  return ((lbPerDay * GRAMS_PER_POUND * 1000) / volumeL) * (TYPICAL_CELL_HOURS / 24);
}
