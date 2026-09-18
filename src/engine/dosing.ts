import { getProduct, type Measure, type Product } from "./products";
import {
  CACO3_MG_PER_EQ,
  alkalinityAt,
  pHForAlkalinity,
  stateFromReading,
  type WaterReading,
} from "./water";

export interface Dose {
  productId: string;
  /** Grams for solids, milliliters for liquids. */
  amount: number;
  unit: "g" | "mL";
  /** Expected change in each measure, ppm (pH in pH units). */
  effects: Partial<Record<Measure, number>>;
  /** Plain-language caveats worth showing next to the number. */
  notes: string[];
}

function unitFor(product: Product): "g" | "mL" {
  return product.form === "liquid" ? "mL" : "g";
}

/**
 * Change in each measure from adding `amount` of a product to a pool of `liters`.
 * pH products report their effect in ppm CaCO3 of alkalinity under `ta`; use
 * `pHAfter` for the resulting pH.
 */
export function effectsOf(
  productId: string,
  amount: number,
  liters: number,
): Partial<Record<Measure, number>> {
  const product = getProduct(productId);
  if (liters <= 0) throw new Error("Pool volume must be positive.");
  const primary = (amount * product.strength) / liters;
  const effects: Partial<Record<Measure, number>> = {};
  const key: Measure = product.raises === "ph" ? "ta" : product.raises;
  effects[key] = primary;
  for (const [measure, ratio] of Object.entries(product.sideEffects)) {
    effects[measure as Measure] = (effects[measure as Measure] ?? 0) + primary * ratio;
  }
  return effects;
}

/** Amount of product that raises a measure by `ppm` in a pool of `liters`. */
export function doseFor(productId: string, ppm: number, liters: number): Dose {
  const product = getProduct(productId);
  if (product.raises === "ph") {
    throw new Error("Use doseForPh for acids and bases.");
  }
  if (ppm <= 0) {
    return { productId, amount: 0, unit: unitFor(product), effects: {}, notes: [] };
  }
  const amount = (ppm * liters) / product.strength;
  const dose: Dose = {
    productId,
    amount,
    unit: unitFor(product),
    effects: effectsOf(productId, amount, liters),
    notes: [],
  };
  if (product.note) dose.notes.push(product.note);
  return dose;
}

export interface PhDoseInput extends WaterReading {
  liters: number;
  targetPh: number;
}

/**
 * Acid or base needed to move pH from the reading to the target, accounting for the
 * carbonate, cyanurate and borate buffers. Returns the dose in the product's unit
 * and the expected TA after the addition.
 */
export function doseForPh(productId: string, input: PhDoseInput): Dose {
  const product = getProduct(productId);
  if (product.raises !== "ph") {
    throw new Error(`${product.name} is not a pH product.`);
  }
  const state = stateFromReading(input);
  const alkNow = alkalinityAt(input.pH, state);
  const wantsLower = input.targetPh < input.pH;
  const isAcid = product.strength < 0;
  const notes: string[] = [];

  if (wantsLower !== isAcid) {
    throw new Error(
      wantsLower
        ? `${product.name} raises pH; pick an acid to lower it.`
        : `${product.name} lowers pH; pick a base to raise it.`,
    );
  }

  if (Math.abs(input.targetPh - input.pH) < 0.005) {
    return { productId, amount: 0, unit: unitFor(product), effects: {}, notes };
  }

  let eqPerLiter: number;
  if (isAcid) {
    // Strong acid removes alkalinity one-for-one; total carbon stays put.
    eqPerLiter = alkNow - alkalinityAt(input.targetPh, state);
  } else {
    // Soda ash adds carbonate: each mole adds two equivalents of alkalinity and one of carbon.
    // Find the dose by bisection on the resulting pH.
    let lo = 0;
    let hi = 0.05; // eq/L, far above any sane single dose
    for (let i = 0; i < 60; i += 1) {
      const mid = (lo + hi) / 2;
      const next = { ...state, carbonTotal: state.carbonTotal + mid / 2 };
      const pH = pHForAlkalinity(alkNow + mid, next);
      if (pH < input.targetPh) lo = mid;
      else hi = mid;
    }
    eqPerLiter = (lo + hi) / 2;
  }

  const mgCaco3PerLiter = eqPerLiter * CACO3_MG_PER_EQ;
  const amount = (mgCaco3PerLiter * input.liters) / Math.abs(product.strength);
  const taChange = isAcid ? -mgCaco3PerLiter : mgCaco3PerLiter;

  if (isAcid) {
    notes.push("Add with the pump running, away from the skimmer; retest after 30 minutes.");
  } else {
    notes.push("Soda ash also raises TA; if TA is already high, aerate to raise pH instead.");
  }
  if (product.note) notes.push(product.note);

  return {
    productId,
    amount,
    unit: unitFor(product),
    effects: { ph: input.targetPh - input.pH, ta: taChange },
    notes,
  };
}

/** Resulting pH after adding `amount` of an acid or base to the water described by `reading`. */
export function pHAfter(productId: string, amount: number, reading: WaterReading & { liters: number }): number {
  const product = getProduct(productId);
  if (product.raises !== "ph") throw new Error(`${product.name} is not a pH product.`);
  const state = stateFromReading(reading);
  const alkNow = alkalinityAt(reading.pH, state);
  const eqPerLiter = (amount * product.strength) / reading.liters / CACO3_MG_PER_EQ;
  if (product.strength < 0) {
    return pHForAlkalinity(alkNow + eqPerLiter, state);
  }
  const next = { ...state, carbonTotal: state.carbonTotal + eqPerLiter / 2 };
  return pHForAlkalinity(alkNow + eqPerLiter, next);
}
