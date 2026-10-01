/**
 * Salt chlorine generator cells and their rated chlorine output at 100%, from the
 * makers' spec sheets. Only cells whose rating is published per day are listed; for any
 * other, the person enters the rating from the cell's label or manual.
 */

// Kept here, not imported from the engine: the cell picker runs in the browser.
const GRAMS_PER_POUND = 453.59237;

export interface SaltCell {
  id: string;
  name: string;
  /** Rated output at 100%, pounds of chlorine per day. */
  lbPerDay: number;
  /**
   * The output settings the cell's own control offers, percent. Absent: any setting in
   * steps of 5% (a dial or fine buttons).
   */
  levels?: number[];
}

/** Pentair IntelliChlor power center: 20% steps above 10% (finer only through automation). */
const PENTAIR_LEVELS = [20, 40, 60, 80, 100];
/** CircuPool CORE: four settings on its button. */
const CORE_LEVELS = [25, 50, 75, 100];
/** CircuPool EDGE: eight LEDs, 12.5% each. */
const EDGE_LEVELS = [12.5, 25, 37.5, 50, 62.5, 75, 87.5, 100];

export const SALT_CELLS: SaltCell[] = [
  { id: "hayward-t15", name: "Hayward TurboCell T-15", lbPerDay: 1.47 },
  { id: "hayward-t9", name: "Hayward TurboCell T-9", lbPerDay: 0.95 },
  { id: "hayward-t5", name: "Hayward TurboCell T-5", lbPerDay: 0.53 },
  { id: "pentair-ic60", name: "Pentair IntelliChlor IC60", lbPerDay: 2.0, levels: PENTAIR_LEVELS },
  { id: "pentair-ic40", name: "Pentair IntelliChlor IC40", lbPerDay: 1.4, levels: PENTAIR_LEVELS },
  { id: "pentair-ic20", name: "Pentair IntelliChlor IC20", lbPerDay: 0.7, levels: PENTAIR_LEVELS },
  { id: "circupool-core55", name: "CircuPool CORE55", lbPerDay: 2.0, levels: CORE_LEVELS },
  { id: "circupool-core35", name: "CircuPool CORE35", lbPerDay: 1.4, levels: CORE_LEVELS },
  { id: "circupool-core15", name: "CircuPool CORE15", lbPerDay: 0.9, levels: CORE_LEVELS },
  { id: "circupool-edge40", name: "CircuPool EDGE40", lbPerDay: 1.7, levels: EDGE_LEVELS },
  { id: "circupool-edge25", name: "CircuPool EDGE25", lbPerDay: 1.2, levels: EDGE_LEVELS },
  { id: "circupool-edge15", name: "CircuPool EDGE15", lbPerDay: 0.7, levels: EDGE_LEVELS },
  { id: "circupool-rj60", name: "CircuPool RJ-60 Plus", lbPerDay: 2.7 },
  { id: "circupool-rj30", name: "CircuPool RJ-30 Plus", lbPerDay: 1.5 },
];

export type OutputUnit = "lb_day" | "g_hour" | "kg_day";

export const OUTPUT_UNITS: { value: OutputUnit; label: string }[] = [
  { value: "lb_day", label: "lb per day" },
  { value: "g_hour", label: "g per hour" },
  { value: "kg_day", label: "kg per day" },
];

/** A rating in any of the units cells are labelled with, as pounds per day. */
export function toLbPerDay(value: number, unit: OutputUnit): number {
  if (unit === "g_hour") return (value * 24) / GRAMS_PER_POUND;
  if (unit === "kg_day") return (value * 1000) / GRAMS_PER_POUND;
  return value;
}

/** Sensible bounds for a residential cell, lb/day. */
export const MIN_LB_PER_DAY = 0.1;
export const MAX_LB_PER_DAY = 10;

export type CellChoice = { ok: true; lbPerDay: number; model: string } | { ok: false; error: string };

/** The cell from the form: a listed model, or a rating with its unit. */
export function cellFromForm(input: { model: string; value: string; unit: string }): CellChoice {
  const listed = SALT_CELLS.find((c) => c.id === input.model);
  if (listed) return { ok: true, lbPerDay: listed.lbPerDay, model: listed.name };
  if (input.model !== "other") return { ok: false, error: "Pick your cell, or enter its rated output." };
  const value = Number(input.value.replace(/,/g, "."));
  if (!input.value.trim() || !Number.isFinite(value) || value <= 0)
    return { ok: false, error: "Enter the cell's rated output." };
  const unit = OUTPUT_UNITS.find((u) => u.value === input.unit)?.value;
  if (!unit) return { ok: false, error: "Pick the unit on the label." };
  const lb = Math.round(toLbPerDay(value, unit) * 100) / 100;
  if (lb < MIN_LB_PER_DAY || lb > MAX_LB_PER_DAY) {
    return {
      ok: false,
      error: "That is outside what home pool cells make (about 0.1 to 10 lb a day). Check the unit.",
    };
  }
  return { ok: true, lbPerDay: lb, model: "Other" };
}

/** The settings a cell offers, by the model name stored on the pool; null for any 5% step. */
export function cellLevels(modelName: string | null | undefined): number[] | null {
  return SALT_CELLS.find((c) => c.name === modelName)?.levels ?? null;
}

/** "25%, 50%, 75% or 100%" for the plan's wording, or null for cells set in 5% steps. */
export function levelsText(levels: number[] | null): string | null {
  if (!levels || levels.length < 2) return null;
  const parts = levels.map((l) => `${l}%`);
  return `${parts.slice(0, -1).join(", ")} or ${parts[parts.length - 1]}`;
}
