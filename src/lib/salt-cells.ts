/**
 * Salt chlorine generator cells and their rated chlorine output at 100%, from the
 * makers' spec sheets. Only cells whose rating is published (per day, or per hour for
 * Australian units) are listed, each with its source; for any other, the person enters
 * the rating from the cell's label or manual.
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
  /** Rated output as the maker publishes it in grams per hour (Australian units), for the picker. */
  gPerHour?: number;
  /** The control is set in levels 1 to this many (wording "level 5 of 8"); `levels` holds their percents. */
  levelCount?: number;
}

/** Pentair IntelliChlor power center: 20% steps above 10% (finer only through automation). */
const PENTAIR_LEVELS = [20, 40, 60, 80, 100];
/** CircuPool CORE: four settings on its button. */
const CORE_LEVELS = [25, 50, 75, 100];
/** CircuPool EDGE: eight LEDs, 12.5% each. */
const EDGE_LEVELS = [12.5, 25, 37.5, 50, 62.5, 75, 87.5, 100];

/** A rating published in g/h, as lb/day to the hundredth (as the cell form stores it). */
function fromGramsPerHour(g: number): number {
  return Math.round(((g * 24) / GRAMS_PER_POUND) * 100) / 100;
}

/** AstralPool controls set in levels 1 to 8 (P1-P8): each level 12.5% of full output. */
const EIGHT_LEVELS = [12.5, 25, 37.5, 50, 62.5, 75, 87.5, 100];

/**
 * AstralPool's recommended salt is 4,000 ppm (±10% here); the E Series asks for 4,000 at
 * the least (and more in cold water, up to 6,000 at 15 °C), so its range starts there.
 */
const ASTRAL_SALT = { low: 3600, high: 4400 };
const ASTRAL_E_SALT = { low: 4000, high: 4800 };

/**
 * Australian cells, all from AstralPool (Fluidra Australia) documents:
 * [A] Chlorinator Range Catalogue 2023 (output in gms/hr, salt range and recommended level),
 *     https://astralpools-au-2.s3.ap-southeast-2.amazonaws.com/Products/EL%20Series%20Chlorinator/AstralPool%20Chlorinator%20Range%20Catalogue%20120723.pdf
 * [B] E Series manual H0712400 rev B (25/35 g/h, levels P1-P8),
 *     https://astralpools-au-2.s3.ap-southeast-2.amazonaws.com/Products/E%20Series%20Chlorinator/H0712400_REVB%20AstralPool%20Eseries%202023.pdf
 * [C] VX manual INST 245 (levels 1-8),
 *     https://s3-ap-southeast-2.amazonaws.com/astralpools-au/manuals/2020_Manuals/INST_245_VX_CHLORINATOR.pdf
 * [D] Viron eQuilibrium manual INST 464 (levels 0-8),
 *     https://s3-ap-southeast-2.amazonaws.com/astralpools-au/INST_464_EQ_Chlorinator_REV_1.9.20_Interactive.pdf
 * [E] Halo Chlor V2 manual H0725000 rev C (levels 0-8 in pool mode),
 *     https://astralpools-au-2.s3.ap-southeast-2.amazonaws.com/Products/Halo_Chlor/Halo%20V2%20Owners%20manual.H0725000_REVC_online.pdf
 * The Viron V series control is not described in a published manual: 5% steps.
 * Not listed for want of a published g/h: Halo Pure (1,500 ppm), Zodiac, Davey, Waterco.
 */
const astral = (id: string, name: string, g: number, salt: { low: number; high: number }, levels: boolean): SaltCell => ({
  id,
  name,
  lbPerDay: fromGramsPerHour(g),
  gPerHour: g,
  saltPpm: salt,
  ...(levels ? { levels: EIGHT_LEVELS, levelCount: 8 } : {}),
});

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
  astral("astralpool-e25", "AstralPool E25", 25, ASTRAL_E_SALT, true), // [A], [B]
  astral("astralpool-e35", "AstralPool E35", 35, ASTRAL_E_SALT, true), // [A], [B]
  astral("astralpool-vx7t", "AstralPool VX 7T", 25, ASTRAL_SALT, true), // [A], [C]
  astral("astralpool-vx9t", "AstralPool VX 9T", 30, ASTRAL_SALT, true), // [A], [C]
  astral("astralpool-vx11t", "AstralPool VX 11T", 42, ASTRAL_SALT, true), // [A], [C]
  astral("astralpool-v18", "AstralPool Viron V18", 18, ASTRAL_SALT, false), // [A]
  astral("astralpool-v25", "AstralPool Viron V25", 25, ASTRAL_SALT, false), // [A]
  astral("astralpool-v35", "AstralPool Viron V35", 35, ASTRAL_SALT, false), // [A]
  astral("astralpool-v45", "AstralPool Viron V45", 45, ASTRAL_SALT, false), // [A]
  astral("astralpool-eq18", "AstralPool Viron eQuilibrium EQ18", 18, ASTRAL_SALT, true), // [A], [D]
  astral("astralpool-eq25", "AstralPool Viron eQuilibrium EQ25", 25, ASTRAL_SALT, true), // [A], [D]
  astral("astralpool-eq35", "AstralPool Viron eQuilibrium EQ35", 35, ASTRAL_SALT, true), // [A], [D]
  astral("astralpool-eq45", "AstralPool Viron eQuilibrium EQ45", 45, ASTRAL_SALT, true), // [A]
  astral("astralpool-halo18", "AstralPool Halo Chlor 18G", 18, ASTRAL_SALT, true), // [A], [E]
  astral("astralpool-halo25", "AstralPool Halo Chlor 25G", 25, ASTRAL_SALT, true), // [A], [E]
  astral("astralpool-halo35", "AstralPool Halo Chlor 35G", 35, ASTRAL_SALT, true), // [A], [E]
  astral("astralpool-halo45", "AstralPool Halo Chlor 45G", 45, ASTRAL_SALT, true), // [A], [E]
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

/** The level count when the pool's cell is set in levels (a listed one, or an "Other" cell set so); else null. */
export function cellLevelCount(modelName: string | null | undefined, count: number | null | undefined): number | null {
  const listed = SALT_CELLS.find((c) => c.name === modelName);
  if (listed) return listed.levelCount ?? null;
  return cellScaleLevels(modelName, count) && count ? count : null;
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
