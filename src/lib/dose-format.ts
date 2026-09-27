import type { Units } from "@/lib/format";
import type { ProductForm } from "@/lib/catalog";

/**
 * Conversions between the engine's base units (grams, millilitres) and the units on
 * the shelf: fluid ounces, quarts and gallons or ounces and pounds in the US;
 * millilitres, litres, grams and kilograms elsewhere. Safe in client components.
 */

export type BaseUnit = "g" | "mL";
export type ShelfUnit = "fl oz" | "qt" | "gal" | "mL" | "L" | "oz" | "lb" | "g" | "kg";

const PER_UNIT: Record<ShelfUnit, number> = {
  "fl oz": 29.5735295625,
  qt: 946.352946,
  gal: 3785.411784,
  mL: 1,
  L: 1000,
  oz: 28.349523125,
  lb: 453.59237,
  g: 1,
  kg: 1000,
};

const BASE_OF: Record<ShelfUnit, BaseUnit> = {
  "fl oz": "mL",
  qt: "mL",
  gal: "mL",
  mL: "mL",
  L: "mL",
  oz: "g",
  lb: "g",
  g: "g",
  kg: "g",
};

export function baseUnitFor(form: ProductForm): BaseUnit {
  return form === "liquid" ? "mL" : "g";
}

/** The units a person can pick for a product, smallest first. */
export function shelfUnits(form: ProductForm, units: Units): ShelfUnit[] {
  if (form === "liquid") return units === "us" ? ["fl oz", "qt", "gal"] : ["mL", "L"];
  return units === "us" ? ["oz", "lb"] : ["g", "kg"];
}

export function isShelfUnit(value: string): value is ShelfUnit {
  return value in PER_UNIT;
}

export function shelfToBase(value: number, unit: ShelfUnit): { amount: number; unit: BaseUnit } {
  return { amount: value * PER_UNIT[unit], unit: BASE_OF[unit] };
}

function roundTo(value: number, step: number): number {
  // toFixed clears the binary noise (0.1 × 23 = 2.3000000000000003).
  return Number((Math.round(value / step) * step).toFixed(2));
}

/**
 * The amount as someone would measure it: the largest sensible shelf unit, rounded
 * to what a measuring cup or kitchen scale can do.
 */
export function baseToShelf(amount: number, unit: BaseUnit, units: Units): { value: number; unit: ShelfUnit } {
  if (unit === "mL") {
    if (units === "us") {
      if (amount >= PER_UNIT.gal * 0.95) return { value: roundTo(amount / PER_UNIT.gal, 0.25), unit: "gal" };
      if (amount >= PER_UNIT.qt * 0.95) return { value: roundTo(amount / PER_UNIT.qt, 0.25), unit: "qt" };
      return { value: roundTo(amount / PER_UNIT["fl oz"], 0.5), unit: "fl oz" };
    }
    if (amount >= 950) return { value: roundTo(amount / 1000, 0.1), unit: "L" };
    return { value: roundTo(amount, 10), unit: "mL" };
  }
  if (units === "us") {
    if (amount >= PER_UNIT.lb * 0.95) return { value: roundTo(amount / PER_UNIT.lb, 0.25), unit: "lb" };
    return { value: roundTo(amount / PER_UNIT.oz, 0.5), unit: "oz" };
  }
  if (amount >= 950) return { value: roundTo(amount / 1000, 0.1), unit: "kg" };
  return { value: roundTo(amount, 10), unit: "g" };
}

export function formatShelf(value: number, unit: ShelfUnit): string {
  const decimals = Number.isInteger(value) ? 0 : Number.isInteger(value * 10) ? 1 : 2;
  return `${value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: decimals })} ${unit}`;
}

export function formatDoseAmount(amount: number, unit: BaseUnit, units: Units): string {
  if (amount <= 0) return "nothing";
  const shelf = baseToShelf(amount, unit, units);
  if (shelf.value <= 0) return "a very small amount";
  return formatShelf(shelf.value, shelf.unit);
}
