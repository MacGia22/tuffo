import type { Units } from "@/lib/format";

/**
 * Turns an engine dose (grams or millilitres) into the units on the shelf:
 * fluid ounces, quarts and gallons or ounces and pounds in the US; millilitres,
 * litres, grams and kilograms elsewhere. Rounded to what a measuring cup can do.
 */

const ML_PER_FL_OZ = 29.5735295625;
const ML_PER_QUART = 946.352946;
const ML_PER_GALLON = 3785.411784;
const G_PER_OZ = 28.349523125;
const G_PER_LB = 453.59237;

function nice(value: number, step: number): string {
  const rounded = Math.round(value / step) * step;
  return rounded.toLocaleString("en-US", { maximumFractionDigits: step < 1 ? 1 : 0 });
}

export function formatDoseAmount(amount: number, unit: "g" | "mL", units: Units): string {
  if (amount <= 0) return "nothing";
  if (unit === "mL") {
    if (units === "us") {
      if (amount >= ML_PER_GALLON * 0.95) return `${nice(amount / ML_PER_GALLON, 0.25)} gal`;
      if (amount >= ML_PER_QUART * 0.95) return `${nice(amount / ML_PER_QUART, 0.25)} qt`;
      return `${nice(amount / ML_PER_FL_OZ, 0.5)} fl oz`;
    }
    if (amount >= 950) return `${nice(amount / 1000, 0.1)} L`;
    return `${nice(amount, 10)} mL`;
  }
  if (units === "us") {
    if (amount >= G_PER_LB * 0.95) return `${nice(amount / G_PER_LB, 0.25)} lb`;
    return `${nice(amount / G_PER_OZ, 0.5)} oz`;
  }
  if (amount >= 950) return `${nice(amount / 1000, 0.1)} kg`;
  return `${nice(amount, 10)} g`;
}
