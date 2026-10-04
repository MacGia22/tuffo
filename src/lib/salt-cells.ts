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
 * Not listed for want of a published g/h: Halo Pure (1,500 ppm).
 */
const astral = (id: string, name: string, g: number, salt: { low: number; high: number }, levels: boolean): SaltCell => ({
  id,
  name,
  lbPerDay: fromGramsPerHour(g),
  gPerHour: g,
  saltPpm: salt,
  ...(levels ? { levels: EIGHT_LEVELS, levelCount: 8 } : {}),
});

/** A cell rated in g/h with its maker's salt range; `levels` (percent) when its control's steps are published. */
const perHour = (id: string, name: string, g: number, salt: { low: number; high: number }, levels?: number[]): SaltCell => ({
  id,
  name,
  lbPerDay: fromGramsPerHour(g),
  gPerHour: g,
  saltPpm: salt,
  ...(levels ? { levels } : {}),
});

/**
 * Zodiac (Australia), from each product page's specifications ("Cell Output : 25 g/h",
 * "Recommended Salinity: 4,000ppm"); the pages do not describe the output steps (5% steps):
 * [Z1] https://www.zodiac.com.au/products/salt-chlorinators/tri-xo-chlorinator-p
 * [Z2] https://www.zodiac.com.au/products/salt-chlorinators/exo-iq-chlorinator-p (also the pH and PRO versions)
 * [Z3] https://www.zodiac.com.au/products/salt-chlorinators/el-series-chlorinator-p
 * [Z4] https://www.zodiac.com.au/products/salt-chlorinators/ezi-salt-chlorinator-p
 */
const ZODIAC_SALT = { low: 3600, high: 4400 };

/**
 * Davey, from its installation manuals:
 * [D1] EcoSalt2, https://daveywater.com/wp-content/uploads/2022/11/Chl_EcoSalt2_IOI.pdf
 *      (output table "DES2-25E(L) 25" g/h at 100%; operating range 3,000-6,000 ppm, low-salt
 *      models 1,500-6,000; output set in 5% steps)
 * [D2] EcoSalt, https://daveywater.com/wp-content/uploads/2022/11/Chl_EcoSalt_IOI.pdf
 *      ("DES13CE 13.0" maximum g/h at 100%; never below 4,000 ppm, ideal 4,500, at most 7,000)
 */
const ECOSALT2_SALT = { low: 3000, high: 6000 };
const ECOSALT2_LOW_SALT = { low: 1500, high: 6000 };
const ECOSALT_SALT = { low: 4000, high: 5000 };

/**
 * Waterco, from its manuals and brochures (cells named by series; the g/h table is shared
 * by the power packs). Salt: minimum 4,000, optimum 5,500, maximum 6,000 ppm.
 * [W1] Electrochlor Mineral manual (10-100% in 10% increments),
 *      https://www.waterco.com.au/waterco/manuals/pool-spa/chlorination/electrochlor-mineral-chlorinator_manual_jan18_single.pdf
 * [W2] Hydrochlor MK3 manual (four LED production levels, their share not published: 5% steps),
 *      https://www.waterco.com.au/waterco/manuals/pool-spa/chlorination/646087_hydrochlormk3-mineral-chlorinator_manual_april2018.pdf
 * [W3] Hydrochlor ST manual,
 *      https://www.waterco.com.au/waterco/manuals/pool-spa/chlorination/hydrochlor-st_manual_sep2019_646088.pdf
 * [W4] Electrochlor Mineral Plus brochure,
 *      https://www.waterco.com.au/waterco/brochures/pool-spa/chlorination/electrochlor-mineral-plus-chlorinator-zzb1985-.pdf
 * [W5] Electrochlor Mineral Pro brochure ("Chlorine output of 40 g/hr or 50 g/hr"),
 *      https://www.waterco.com.au/waterco/brochures/pool-spa/chlorination/electrochlor-mineral-pro-brochure-jun19_zzb1958.pdf
 */
const WATERCO_SALT = { low: 5000, high: 6000 };
const TEN_PERCENT_STEPS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

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
  perHour("zodiac-tri-xo-18", "Zodiac TRi-XO 18", 18, ZODIAC_SALT), // [Z1]
  perHour("zodiac-tri-xo-25", "Zodiac TRi-XO 25", 25, ZODIAC_SALT), // [Z1]
  perHour("zodiac-tri-xo-35", "Zodiac TRi-XO 35", 35, ZODIAC_SALT), // [Z1]
  perHour("zodiac-exo-iq-25", "Zodiac eXO iQ 25", 25, ZODIAC_SALT), // [Z2]
  perHour("zodiac-exo-iq-35", "Zodiac eXO iQ 35", 35, ZODIAC_SALT), // [Z2]
  perHour("zodiac-el-25", "Zodiac EL Series 25", 25, ZODIAC_SALT), // [Z3]
  perHour("zodiac-el-35", "Zodiac EL Series 35", 35, ZODIAC_SALT), // [Z3]
  perHour("zodiac-ezi-salt-24", "Zodiac Ezi Salt 24", 24, ZODIAC_SALT), // [Z4]
  perHour("zodiac-ezi-salt-40", "Zodiac Ezi Salt 40", 40, ZODIAC_SALT), // [Z4]
  perHour("davey-des2-15e", "Davey EcoSalt2 DES2-15E", 15, ECOSALT2_SALT), // [D1]
  perHour("davey-des2-25e", "Davey EcoSalt2 DES2-25E", 25, ECOSALT2_SALT), // [D1]
  perHour("davey-des2-35e", "Davey EcoSalt2 DES2-35E", 35, ECOSALT2_SALT), // [D1]
  perHour("davey-des2-15el", "Davey EcoSalt2 DES2-15EL (low salt)", 15, ECOSALT2_LOW_SALT), // [D1]
  perHour("davey-des2-25el", "Davey EcoSalt2 DES2-25EL (low salt)", 25, ECOSALT2_LOW_SALT), // [D1]
  perHour("davey-des13ce", "Davey EcoSalt DES13CE", 13, ECOSALT_SALT), // [D2]
  perHour("davey-des20ce", "Davey EcoSalt DES20CE", 20, ECOSALT_SALT), // [D2]
  perHour("davey-des26ce", "Davey EcoSalt DES26CE", 26, ECOSALT_SALT), // [D2]
  perHour("waterco-electrochlor-2000", "Waterco Electrochlor Mineral Series 2000", 20, WATERCO_SALT, TEN_PERCENT_STEPS), // [W1]
  perHour("waterco-electrochlor-2500", "Waterco Electrochlor Mineral Series 2500", 25, WATERCO_SALT, TEN_PERCENT_STEPS), // [W1]
  perHour("waterco-electrochlor-3000", "Waterco Electrochlor Mineral Series 3000", 30, WATERCO_SALT, TEN_PERCENT_STEPS), // [W1]
  perHour("waterco-hydrochlor-mk3-2000", "Waterco Hydrochlor MK3 Series 2000", 20, WATERCO_SALT), // [W2]
  perHour("waterco-hydrochlor-mk3-2500", "Waterco Hydrochlor MK3 Series 2500", 25, WATERCO_SALT), // [W2]
  perHour("waterco-hydrochlor-mk3-3000", "Waterco Hydrochlor MK3 Series 3000", 30, WATERCO_SALT), // [W2]
  perHour("waterco-hydrochlor-st-2000", "Waterco Hydrochlor ST Series 2000", 20, WATERCO_SALT), // [W3]
  perHour("waterco-hydrochlor-st-2500", "Waterco Hydrochlor ST Series 2500", 25, WATERCO_SALT), // [W3]
  perHour("waterco-hydrochlor-st-3000", "Waterco Hydrochlor ST Series 3000", 30, WATERCO_SALT), // [W3]
  perHour("waterco-electrochlor-plus-2000", "Waterco Electrochlor Mineral Plus 2000", 20, WATERCO_SALT), // [W4]
  perHour("waterco-electrochlor-plus-2500", "Waterco Electrochlor Mineral Plus 2500", 25, WATERCO_SALT), // [W4]
  perHour("waterco-electrochlor-plus-3000", "Waterco Electrochlor Mineral Plus 3000", 30, WATERCO_SALT), // [W4]
  perHour("waterco-electrochlor-pro-4000", "Waterco Electrochlor Mineral Pro 4000", 40, WATERCO_SALT), // [W5]
  perHour("waterco-electrochlor-pro-5000", "Waterco Electrochlor Mineral Pro 5000", 50, WATERCO_SALT), // [W5]
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
