/**
 * Carbonate-system model of pool water, used for pH dosing and the saturation index.
 *
 * Alkalinity is carried in equivalents per liter; concentrations in mol/L.
 * Constants are 25 °C values nudged for pool ionic strength and are approximate.
 */

export const CACO3_MG_PER_EQ = 50_044;
export const CYA_MG_PER_MOL = 129_070;
export const BORON_MG_PER_MOL = 10_810; // borates are reported as ppm boron

export const PK1 = 6.33; // carbonic acid, first dissociation
export const PK2 = 10.25; // bicarbonate, second dissociation
export const PKW = 14.0;
export const PKA_CYA = 6.85; // cyanuric acid
export const PKA_BORIC = 9.1; // boric acid

/** Fraction of a monoprotic buffer present as the deprotonated (alkalinity-carrying) species. */
export function deprotonatedFraction(pH: number, pKa: number): number {
  return 1 / (1 + 10 ** (pKa - pH));
}

/** Carbonate species fractions: [H2CO3*, HCO3-, CO3--]. */
export function carbonateFractions(pH: number): [number, number, number] {
  const a = 10 ** (PK1 - pH); // H2CO3* relative to HCO3-
  const b = 10 ** (pH - PK2); // CO3-- relative to HCO3-
  const alpha1 = 1 / (1 + a + b);
  return [alpha1 * a, alpha1, alpha1 * b];
}

export interface WaterState {
  /** Total dissolved inorganic carbon, mol/L. */
  carbonTotal: number;
  /** Cyanuric acid, mol/L. */
  cyaTotal: number;
  /** Borate (as boron), mol/L. */
  borateTotal: number;
}

/** Total alkalinity (eq/L) of a water state at a given pH. */
export function alkalinityAt(pH: number, state: WaterState): number {
  const [, alpha1, alpha2] = carbonateFractions(pH);
  const carbonate = state.carbonTotal * (alpha1 + 2 * alpha2);
  const cyanurate = state.cyaTotal * deprotonatedFraction(pH, PKA_CYA);
  const borate = state.borateTotal * deprotonatedFraction(pH, PKA_BORIC);
  const hydroxide = 10 ** (pH - PKW);
  const hydrogen = 10 ** -pH;
  return carbonate + cyanurate + borate + hydroxide - hydrogen;
}

export interface WaterReading {
  pH: number;
  /** Total alkalinity, ppm as CaCO3 (as a test kit reports it). */
  ta: number;
  /** Cyanuric acid, ppm. */
  cya?: number;
  /** Borates, ppm as boron. */
  borate?: number;
}

/** Reconstruct the water state from a measured pH and total alkalinity. */
export function stateFromReading(reading: WaterReading): WaterState {
  const cyaTotal = (reading.cya ?? 0) / CYA_MG_PER_MOL;
  const borateTotal = (reading.borate ?? 0) / BORON_MG_PER_MOL;
  const measuredAlk = reading.ta / CACO3_MG_PER_EQ;
  const [, alpha1, alpha2] = carbonateFractions(reading.pH);
  const nonCarbonate =
    cyaTotal * deprotonatedFraction(reading.pH, PKA_CYA) +
    borateTotal * deprotonatedFraction(reading.pH, PKA_BORIC) +
    10 ** (reading.pH - PKW) -
    10 ** -reading.pH;
  const carbonTotal = Math.max(0, (measuredAlk - nonCarbonate) / (alpha1 + 2 * alpha2));
  return { carbonTotal, cyaTotal, borateTotal };
}

/** Carbonate alkalinity only, ppm as CaCO3: total alkalinity minus the CYA and borate share. */
export function carbonateAlkalinity(reading: WaterReading): number {
  const state = stateFromReading(reading);
  const [, alpha1, alpha2] = carbonateFractions(reading.pH);
  return state.carbonTotal * (alpha1 + 2 * alpha2) * CACO3_MG_PER_EQ;
}

/** Solve for the pH at which the state has the given alkalinity (eq/L). */
export function pHForAlkalinity(targetAlk: number, state: WaterState): number {
  let lo = 4;
  let hi = 12;
  for (let i = 0; i < 60; i += 1) {
    const mid = (lo + hi) / 2;
    if (alkalinityAt(mid, state) < targetAlk) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return (lo + hi) / 2;
}
