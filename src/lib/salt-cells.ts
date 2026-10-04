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
  /**
   * Hours of operation the maker rates the cell plates for, when published (counted at the
   * output it runs: a cell at 50% is on about half the time). Absent: not published.
   */
  ratedHours?: number;
  /** The salt range the maker asks for, ppm, when it is not the usual 2,800-3,600. */
  saltPpm?: { low: number; high: number };
}

/** Pentair IntelliChlor power center: 20% steps above 10% (finer only through automation). */
const PENTAIR_LEVELS = [20, 40, 60, 80, 100];
/** CircuPool CORE: four settings on its button. */
const CORE_LEVELS = [25, 50, 75, 100];
/** CircuPool EDGE: eight LEDs, 12.5% each. */
const EDGE_LEVELS = [12.5, 25, 37.5, 50, 62.5, 75, 87.5, 100];

export const SALT_CELLS: SaltCell[] = [
  { id: "hayward-t15", name: "Hayward TurboCell T-15", lbPerDay: 1.47, ratedHours: 10000 },
  { id: "hayward-t9", name: "Hayward TurboCell T-9", lbPerDay: 0.95, ratedHours: 10000 },
  { id: "hayward-t5", name: "Hayward TurboCell T-5", lbPerDay: 0.53, ratedHours: 10000 },
  { id: "pentair-ic60", name: "Pentair IntelliChlor IC60", lbPerDay: 2.0, levels: PENTAIR_LEVELS, ratedHours: 10000 },
  { id: "pentair-ic40", name: "Pentair IntelliChlor IC40", lbPerDay: 1.4, levels: PENTAIR_LEVELS, ratedHours: 10000 },
  { id: "pentair-ic20", name: "Pentair IntelliChlor IC20", lbPerDay: 0.7, levels: PENTAIR_LEVELS, ratedHours: 10000 },
  { id: "circupool-core55", name: "CircuPool CORE55", lbPerDay: 2.0, levels: CORE_LEVELS },
  { id: "circupool-core35", name: "CircuPool CORE35", lbPerDay: 1.4, levels: CORE_LEVELS },
  { id: "circupool-core15", name: "CircuPool CORE15", lbPerDay: 0.9, levels: CORE_LEVELS },
  { id: "circupool-edge40", name: "CircuPool EDGE40", lbPerDay: 1.7, levels: EDGE_LEVELS },
  { id: "circupool-edge25", name: "CircuPool EDGE25", lbPerDay: 1.2, levels: EDGE_LEVELS },
  { id: "circupool-edge15", name: "CircuPool EDGE15", lbPerDay: 0.7, levels: EDGE_LEVELS },
  { id: "circupool-rj60", name: "CircuPool RJ-60 Plus", lbPerDay: 2.7, ratedHours: 15000 },
  { id: "circupool-rj30", name: "CircuPool RJ-30 Plus", lbPerDay: 1.5, ratedHours: 15000 },
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

/** The cell's rated hours by the model name stored on the pool; null when not published. */
export function cellRatedHours(modelName: string | null | undefined): number | null {
  return SALT_CELLS.find((c) => c.name === modelName)?.ratedHours ?? null;
}

/** "25%, 50%, 75% or 100%" for the plan's wording, or null for cells set in 5% steps. */
export function levelsText(levels: number[] | null): string | null {
  if (!levels || levels.length < 2) return null;
  const parts = levels.map((l) => `${l}%`);
  return `${parts.slice(0, -1).join(", ")} or ${parts[parts.length - 1]}`;
}

/** Salt levels a chlorinator may ask for, ppm (low-salt units to sea-water-like ones). */
export const MIN_SALT_PPM = 500;
export const MAX_SALT_PPM = 10_000;

export type SaltTargetChoice =
  | { ok: true; target: { low: number; high: number } | null }
  | { ok: false; error: string };

/**
 * The salt range from the settings field: "3000-3500" (any dash or "to"), or one number,
 * which becomes ±10% ("6000" → 5,400-6,600). Empty: no range of the pool's own.
 */
export function parseSaltTarget(text: string): SaltTargetChoice {
  const clean = text.trim().toLowerCase().replace(/ppm/g, "").replace(/,/g, "");
  if (!clean) return { ok: true, target: null };
  const parts = clean.split(/\s*(?:-|–|—|to)\s*/).filter(Boolean);
  const numbers = parts.map(Number);
  const bad = { ok: false as const, error: "Enter the salt level as one number (3200) or a range (2700-3400), in ppm." };
  if (parts.length < 1 || parts.length > 2 || numbers.some((n) => !Number.isFinite(n) || n <= 0)) return bad;
  const [low, high] =
    numbers.length === 1
      ? [Math.round((numbers[0] * 0.9) / 10) * 10, Math.round((numbers[0] * 1.1) / 10) * 10]
      : [Math.round(Math.min(...numbers)), Math.round(Math.max(...numbers))];
  if (low >= high) return { ok: false, error: "The low end has to be below the high end." };
  if (low < MIN_SALT_PPM || high > MAX_SALT_PPM) {
    return { ok: false, error: "Chlorinators ask for about 1,500 to 6,000 ppm. Check the number, in ppm (not g/L or %)." };
  }
  return { ok: true, target: { low, high } };
}

/**
 * The salt range for a pool: its own (from the settings), else its listed cell's, else
 * null (the engine's 2,800-3,600 ppm).
 */
export function poolSaltTarget(pool: {
  salt_target_low_ppm?: number | null;
  salt_target_high_ppm?: number | null;
  swg_cell_model?: string | null;
}): { low: number; high: number } | null {
  const low = pool.salt_target_low_ppm;
  const high = pool.salt_target_high_ppm;
  if (low !== null && low !== undefined && high !== null && high !== undefined && Number(low) < Number(high)) {
    return { low: Number(low), high: Number(high) };
  }
  const listed = SALT_CELLS.find((c) => c.name === pool.swg_cell_model)?.saltPpm;
  return listed ? { ...listed } : null;
}

/** The usual range (most US cells): the engine's DEFAULT_SALT_TARGET, kept in step by a test. */
export const DEFAULT_SALT_TARGET_PPM = { low: 2800, high: 3600 } as const;
export const DEFAULT_SALT_TEXT = "2,800–3,600 ppm";

/** "2,800–3,600 ppm" for the settings card and hints. */
export function saltTargetText(target: { low: number; high: number }): string {
  return `${target.low.toLocaleString("en-US")}–${target.high.toLocaleString("en-US")} ppm`;
}

/** Levels a chlorinator's control may have (an AstralPool E Series has 8). */
export const MIN_CELL_LEVELS = 2;
export const MAX_CELL_LEVELS = 20;

/**
 * The output settings, percent, of a cell set in levels 1 to `count` (level k is
 * k/count of full output), or of a listed cell; null for any 5% step.
 */
export function cellScaleLevels(modelName: string | null | undefined, count: number | null | undefined): number[] | null {
  if (count && count >= MIN_CELL_LEVELS && count <= MAX_CELL_LEVELS && !SALT_CELLS.some((c) => c.name === modelName)) {
    return Array.from({ length: count }, (_, i) => ((i + 1) * 100) / count);
  }
  return cellLevels(modelName);
}

/** The level count when the pool's cell is set in levels (an "Other" cell only); else null. */
export function cellLevelCount(modelName: string | null | undefined, count: number | null | undefined): number | null {
  return cellScaleLevels(modelName, count) && count && !SALT_CELLS.some((c) => c.name === modelName) ? count : null;
}

/**
 * A cell setting as the person sets it: "level 5 of 8" for a cell set in levels, "60%"
 * otherwise. 0 is "off".
 */
export function cellSettingText(percent: number, levelCount: number | null | undefined): string {
  if (percent <= 0) return "off";
  if (levelCount) return `level ${Math.min(levelCount, Math.max(1, Math.round((percent * levelCount) / 100)))} of ${levelCount}`;
  return `${Math.round(percent * 2) / 2}%`;
}

/** The percent stored for level `level` of `count`, to the 0.5% the event log keeps. */
export function levelToPercent(level: number, count: number): number {
  return Math.round(((level * 100) / count) * 2) / 2;
}

export type CellLevelsChoice = { ok: true; count: number | null } | { ok: false; error: string };

/** Percent (null) or levels 1 to N, for an "Other" cell; listed cells keep their own settings. */
export function cellLevelsFromForm(model: string, scale: string, value: string): CellLevelsChoice {
  if (model !== "Other" || scale !== "levels") return { ok: true, count: null };
  const count = Number(value);
  if (!Number.isInteger(count) || count < MIN_CELL_LEVELS || count > MAX_CELL_LEVELS) {
    return { ok: false, error: `Enter the highest level on the cell's control (${MIN_CELL_LEVELS} to ${MAX_CELL_LEVELS}).` };
  }
  return { ok: true, count };
}
