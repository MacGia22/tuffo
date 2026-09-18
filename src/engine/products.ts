/**
 * Pool chemical products and what one unit of each does to one liter of water.
 *
 * Effects are expressed as milligrams of the affected measure per unit of product,
 * per liter of pool water: ppm change = (amount × effect) / liters.
 *
 * Sources for the constants are basic stoichiometry, cross-checked against the
 * rules of thumb the Trouble Free Pool community publishes (for example, one pound of
 * 73% cal-hypo in 10,000 gallons raises FC by about 8.8 ppm and CH by about 6 ppm).
 */

export type Measure = "fc" | "ph" | "ta" | "ch" | "cya" | "salt" | "borate";

export type ProductForm = "liquid" | "solid";

export interface Product {
  id: string;
  name: string;
  form: ProductForm;
  /** The measure this product is normally dosed for. */
  raises: Measure;
  /**
   * Milligrams of the primary measure per unit (mL for liquids, g for solids), per liter.
   * For pH products this is the acid or base strength in milligrams of CaCO3 equivalent.
   */
  strength: number;
  /** Secondary effects in ppm per ppm of the primary measure (or per ppm CaCO3 eq for pH products). */
  sideEffects: Partial<Record<Measure, number>>;
  /** Approximate density for liquids, g/mL, used only for weight/volume conversions. */
  density?: number;
  note?: string;
}

const AVAILABLE_CHLORINE_MG_PER_G = 1000;
const CACO3_MG_PER_EQ = 50_044; // mg of CaCO3 per equivalent

// Ca(OCl)2: calcium (as CaCO3) per unit available chlorine = 100.09 / 141.9
const CALHYPO_CH_PER_FC = 0.705;
// Trichlor: CYA per unit available chlorine = 129.07 / 212.7
const TRICHLOR_CYA_PER_FC = 0.607;
// Trichlor is acidic: about 0.7 ppm TA consumed per ppm FC (community figure)
const TRICHLOR_TA_PER_FC = -0.7;
// Dichlor: CYA per unit available chlorine = 129.07 / 141.8
const DICHLOR_CYA_PER_FC = 0.91;

export const products: Record<string, Product> = {
  "liquid-chlorine-12.5": {
    id: "liquid-chlorine-12.5",
    name: "Liquid chlorine 12.5% (sodium hypochlorite)",
    form: "liquid",
    raises: "fc",
    // Trade percent: grams of available chlorine per 100 mL → 125 mg per mL
    strength: 12.5 * 10,
    sideEffects: {},
    density: 1.2,
    note: "Trade percent labelling; 10% household bleach has strength 100.",
  },
  "liquid-chlorine-10": {
    id: "liquid-chlorine-10",
    name: "Liquid chlorine 10% (sodium hypochlorite)",
    form: "liquid",
    raises: "fc",
    strength: 10 * 10,
    sideEffects: {},
    density: 1.16,
  },
  "bleach-6": {
    id: "bleach-6",
    name: "Household bleach 6%",
    form: "liquid",
    raises: "fc",
    strength: 6 * 10,
    sideEffects: {},
    density: 1.1,
  },
  "cal-hypo-73": {
    id: "cal-hypo-73",
    name: "Cal-hypo 73%",
    form: "solid",
    raises: "fc",
    strength: 0.73 * AVAILABLE_CHLORINE_MG_PER_G,
    sideEffects: { ch: CALHYPO_CH_PER_FC },
  },
  "cal-hypo-65": {
    id: "cal-hypo-65",
    name: "Cal-hypo 65%",
    form: "solid",
    raises: "fc",
    strength: 0.65 * AVAILABLE_CHLORINE_MG_PER_G,
    sideEffects: { ch: CALHYPO_CH_PER_FC },
  },
  "trichlor-90": {
    id: "trichlor-90",
    name: "Trichlor tablets 90%",
    form: "solid",
    raises: "fc",
    strength: 0.9 * AVAILABLE_CHLORINE_MG_PER_G,
    sideEffects: { cya: TRICHLOR_CYA_PER_FC, ta: TRICHLOR_TA_PER_FC },
  },
  "dichlor-56": {
    id: "dichlor-56",
    name: "Dichlor 56%",
    form: "solid",
    raises: "fc",
    strength: 0.56 * AVAILABLE_CHLORINE_MG_PER_G,
    sideEffects: { cya: DICHLOR_CYA_PER_FC },
  },
  "muriatic-acid-31.45": {
    id: "muriatic-acid-31.45",
    name: "Muriatic acid 31.45%",
    form: "liquid",
    raises: "ph",
    // 0.3145 × 1.16 g HCl per mL → 0.010006 mol H+ → mg CaCO3 equivalent
    strength: -(0.3145 * 1.16) / 36.461 * CACO3_MG_PER_EQ,
    sideEffects: {},
    density: 1.16,
    note: "Lowers pH; also lowers TA by the same CaCO3-equivalent amount.",
  },
  "dry-acid-93": {
    id: "dry-acid-93",
    name: "Dry acid 93% (sodium bisulfate)",
    form: "solid",
    raises: "ph",
    strength: -(0.93 / 120.06) * CACO3_MG_PER_EQ,
    sideEffects: {},
  },
  "soda-ash": {
    id: "soda-ash",
    name: "Soda ash (sodium carbonate)",
    form: "solid",
    raises: "ph",
    // 2 equivalents per mole of Na2CO3
    strength: (2 / 105.99) * CACO3_MG_PER_EQ,
    sideEffects: {},
    note: "Raises pH and TA together.",
  },
  "baking-soda": {
    id: "baking-soda",
    name: "Baking soda (sodium bicarbonate)",
    form: "solid",
    raises: "ta",
    strength: (1 / 84.007) * CACO3_MG_PER_EQ,
    sideEffects: {},
    note: "Raises TA with only a small pH effect.",
  },
  "calcium-chloride-97": {
    id: "calcium-chloride-97",
    name: "Calcium chloride 94-97% (anhydrous)",
    form: "solid",
    raises: "ch",
    // Ca fraction 40.08/110.98, expressed as CaCO3 (× 100.09/40.08), at 97% purity
    strength: 0.97 * (100.09 / 110.98) * 1000,
    sideEffects: {},
  },
  "calcium-chloride-77": {
    id: "calcium-chloride-77",
    name: "Calcium chloride 77% (dihydrate)",
    form: "solid",
    raises: "ch",
    strength: (100.09 / 147.01) * 1000,
    sideEffects: {},
  },
  "cyanuric-acid": {
    id: "cyanuric-acid",
    name: "Stabilizer (cyanuric acid)",
    form: "solid",
    raises: "cya",
    strength: 1000,
    sideEffects: {},
    note: "Dissolves slowly; retest CYA after a week.",
  },
  salt: {
    id: "salt",
    name: "Pool salt (sodium chloride)",
    form: "solid",
    raises: "salt",
    strength: 1000,
    sideEffects: {},
  },
};

export function getProduct(id: string): Product {
  const product = products[id];
  if (!product) {
    throw new Error(`Unknown product: ${id}`);
  }
  return product;
}
