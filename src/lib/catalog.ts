/**
 * The product list as the interface needs it: names and physical form only. Safe to
 * ship to the browser; the chemistry (strengths, side effects) stays in the
 * server-only engine. A unit test keeps this list in step with the engine's.
 */

export type ProductForm = "liquid" | "solid";

export interface CatalogProduct {
  id: string;
  /** Full name, as on the label. */
  name: string;
  /** Short name for sentences ("Add 2.5 qt of liquid chlorine"). */
  short: string;
  form: ProductForm;
  group: "Chlorine" | "Lower pH" | "Raise pH or alkalinity" | "Calcium" | "Stabilizer" | "Salt";
}

export const CATALOG: CatalogProduct[] = [
  { id: "liquid-chlorine-12.5", name: "Liquid chlorine 12.5%", short: "liquid chlorine 12.5%", form: "liquid", group: "Chlorine" },
  { id: "liquid-chlorine-10", name: "Liquid chlorine 10%", short: "liquid chlorine 10%", form: "liquid", group: "Chlorine" },
  { id: "bleach-6", name: "Household bleach 6%", short: "bleach 6%", form: "liquid", group: "Chlorine" },
  { id: "cal-hypo-73", name: "Cal-hypo 73% (shock)", short: "cal-hypo 73%", form: "solid", group: "Chlorine" },
  { id: "cal-hypo-65", name: "Cal-hypo 65% (shock)", short: "cal-hypo 65%", form: "solid", group: "Chlorine" },
  { id: "trichlor-90", name: "Trichlor tablets or pucks", short: "trichlor", form: "solid", group: "Chlorine" },
  { id: "dichlor-56", name: "Dichlor granules", short: "dichlor", form: "solid", group: "Chlorine" },
  { id: "muriatic-acid-31.45", name: "Muriatic acid 31.45%", short: "muriatic acid", form: "liquid", group: "Lower pH" },
  { id: "pool-acid-32", name: "Pool acid (hydrochloric acid) 32%", short: "pool acid", form: "liquid", group: "Lower pH" },
  { id: "dry-acid-93", name: "Dry acid (sodium bisulfate)", short: "dry acid", form: "solid", group: "Lower pH" },
  { id: "soda-ash", name: "Soda ash (pH up)", short: "soda ash", form: "solid", group: "Raise pH or alkalinity" },
  { id: "baking-soda", name: "Baking soda (alkalinity up)", short: "baking soda", form: "solid", group: "Raise pH or alkalinity" },
  { id: "calcium-chloride-97", name: "Calcium chloride 94-97%", short: "calcium chloride", form: "solid", group: "Calcium" },
  { id: "calcium-chloride-77", name: "Calcium chloride 77%", short: "calcium chloride (77%)", form: "solid", group: "Calcium" },
  { id: "cyanuric-acid", name: "Stabilizer (cyanuric acid)", short: "stabilizer", form: "solid", group: "Stabilizer" },
  { id: "salt", name: "Pool salt", short: "pool salt", form: "solid", group: "Salt" },
];

const BY_ID = new Map(CATALOG.map((p) => [p.id, p]));

export function catalogProduct(id: string): CatalogProduct | undefined {
  return BY_ID.get(id);
}

/** The liquid acid advice uses: pool acid 32% for metric pools (Australia), muriatic 31.45% for US pools. */
export function acidFor(units: "us" | "metric"): "pool-acid-32" | "muriatic-acid-31.45" {
  return units === "metric" ? "pool-acid-32" : "muriatic-acid-31.45";
}

/**
 * The short name for sentences. Metric pools call baking soda "baking soda (buffer)", the
 * name on Australian shop shelves; everything else is the catalog's own.
 */
export function productShort(id: string, units: "us" | "metric" = "us"): string {
  if (id === "baking-soda" && units === "metric") return "baking soda (buffer)";
  return catalogProduct(id)?.short ?? id;
}

export const CATALOG_GROUPS = [...new Set(CATALOG.map((p) => p.group))];
