/**
 * Unit helpers. The engine works in SI: liters, grams, milliliters, degrees Celsius.
 * The UI converts at the edges.
 */

export const LITERS_PER_US_GALLON = 3.785411784;
export const GRAMS_PER_POUND = 453.59237;
export const GRAMS_PER_OUNCE = 28.349523125;
export const ML_PER_US_FL_OZ = 29.5735295625;

export const gallonsToLiters = (gal: number) => gal * LITERS_PER_US_GALLON;
export const litersToGallons = (l: number) => l / LITERS_PER_US_GALLON;

export const poundsToGrams = (lb: number) => lb * GRAMS_PER_POUND;
export const gramsToPounds = (g: number) => g / GRAMS_PER_POUND;

export const ouncesToGrams = (oz: number) => oz * GRAMS_PER_OUNCE;
export const gramsToOunces = (g: number) => g / GRAMS_PER_OUNCE;

export const flOzToMl = (oz: number) => oz * ML_PER_US_FL_OZ;
export const mlToFlOz = (ml: number) => ml / ML_PER_US_FL_OZ;

export const fahrenheitToCelsius = (f: number) => ((f - 32) * 5) / 9;
export const celsiusToFahrenheit = (c: number) => (c * 9) / 5 + 32;

/** Round to a sensible number of decimals for display. */
export function round(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
