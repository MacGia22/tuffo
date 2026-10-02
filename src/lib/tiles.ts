/**
 * The "Water now" tiles at the top of a pool: each measure from its newest test against
 * the pool's target range, with a status chip and one line of context, and how old the
 * test is. Pure; browser-safe.
 */

export type Level = "low" | "ok" | "high";

export interface Range {
  low: number;
  high: number;
}

/** Below, inside or above a range (the ends count as inside). */
export function levelOf(value: number, range: Range): Level {
  if (value < range.low) return "low";
  if (value > range.high) return "high";
  return "ok";
}

/** Combined chlorine above this is worth acting on. */
export const CC_MAX = 0.5;

export const LEVEL_LABEL: Record<Level, string> = { low: "Low", ok: "OK", high: "High" };

/** "3–4.5", trimming needless decimals. */
export function rangeText(range: Range): string {
  const n = (v: number) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10));
  return range.low === range.high ? n(range.low) : `${n(range.low)}–${n(range.high)}`;
}

export interface TileTargets {
  fc: Range;
  ph: Range;
  ta: Range;
  ch: Range;
  cya: Range;
  salt?: Range;
}

export interface TileReading {
  fc: number | null;
  cc: number | null;
  ph: number | null;
  ta: number | null;
  ch: number | null;
  cya: number | null;
  salt: number | null;
}

export type TileKey = "fc" | "ph" | "ta" | "cya" | "ch" | "salt";

/**
 * Where a tile stands. "too-low" and "too-high" are outside the bounds that need action
 * now (free chlorine below its minimum or above shock level); "old" is a reading past
 * its retest age; "none" was never tested.
 */
export type TileState = "ok" | "high" | "low" | "too-low" | "too-high" | "none" | "old";

export const TILE_LABELS: Record<TileKey, string> = {
  fc: "Free chlorine",
  ph: "pH",
  ta: "Alkalinity",
  cya: "Stabilizer",
  ch: "Calcium",
  salt: "Salt",
};

const TILE_UNITS: Record<TileKey, string> = { fc: "ppm", ph: "", ta: "ppm", cya: "ppm", ch: "ppm", salt: "ppm" };

/** Free chlorine and pH move daily; the rest drift over weeks. */
export const OLD_AFTER_DAYS: Record<TileKey, number> = { fc: 7, ph: 7, ta: 30, cya: 30, ch: 30, salt: 30 };

/** Which tile a product counts for (its main effect), by catalog id or group. */
export function tileForProduct(productId: string, group: string | undefined): TileKey | null {
  if (productId === "soda-ash") return "ph";
  if (productId === "baking-soda") return "ta";
  switch (group) {
    case "Chlorine":
      return "fc";
    case "Lower pH":
      return "ph";
    case "Calcium":
      return "ch";
    case "Stabilizer":
      return "cya";
    case "Salt":
      return "salt";
    default:
      return null;
  }
}

export interface WaterTile {
  key: TileKey;
  label: string;
  value: number | null;
  /** "7.8", "7.45", "3,200"; "—" when never tested. */
  valueText: string;
  unit: string;
  state: TileState;
  /** The chip's word: "OK", "Too low", "No reading", "32 days ago". */
  chip: string;
  /** "target 3–5" */
  target: string;
  /** One context line: the action, what was added, the change, or what to do; null for nothing. */
  note: string | null;
}

export interface WaterTilesInput {
  /** Tests, any order; a measure's tile uses its newest value. */
  readings: Array<{ taken_at: string } & Partial<Record<TileKey, number | null>>>;
  targets: TileTargets;
  /** Free chlorine bounds that need action now. */
  fcMin: number;
  fcSlam: number;
  swg: boolean;
  /** Products logged, any order: which product, when, and the amount as measured ("1.5 lb"). */
  doses: Array<{ productId: string; group?: string; addedAt: string; amountText: string }>;
  /** What to do when free chlorine is too low: "Add 1 qt of liquid chlorine 12.5% now". */
  fcAction?: string | null;
  now: number;
  timeZone: string;
}

/** True minus sign for negatives, "+" for positives. */
export function signed(value: number, decimals: number): string {
  const text = Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return `${value < 0 ? "\u2212" : "+"}${text}`;
}

function valueText(key: TileKey, value: number): string {
  if (key === "ph") return value.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 2 });
  if (key === "fc") return value.toFixed(1);
  return Math.round(value).toLocaleString("en-US");
}

function shortDay(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone });
}

/**
 * "Water now": one tile per measure (salt only for salt pools), each from that measure's
 * newest test, so a stabilizer test from last month shows next to this morning's chlorine.
 * The context line is, first that applies: the action for a value outside the safe bounds;
 * something added for the measure in the last 7 days; the change since the test before.
 */
export function waterTiles(input: WaterTilesInput): WaterTile[] {
  const keys: TileKey[] = ["fc", "ph", "ta", "cya", "ch"];
  if (input.swg) keys.push("salt");
  const sorted = [...input.readings].sort((a, b) => Date.parse(b.taken_at) - Date.parse(a.taken_at));
  const weekAgo = input.now - 7 * DAY_MS;
  return keys.map((key) => {
    const range = input.targets[key];
    const target = range ? `target ${rangeText(range)}${TILE_UNITS[key] ? ` ${TILE_UNITS[key]}` : ""}` : "";
    const base = { key, label: TILE_LABELS[key], unit: TILE_UNITS[key], target };
    const tests = sorted.filter((r) => r[key] !== null && r[key] !== undefined);
    const latest = tests[0];
    if (!latest) {
      return { ...base, value: null, valueText: "\u2014", state: "none", chip: "No reading", note: "Add it with your next test" };
    }
    const value = Number(latest[key]);
    const days = (input.now - Date.parse(latest.taken_at)) / DAY_MS;
    const added = input.doses
      .filter((d) => tileForProduct(d.productId, d.group) === key && Date.parse(d.addedAt) >= weekAgo)
      .sort((a, b) => Date.parse(b.addedAt) - Date.parse(a.addedAt))[0];
    const addedText = added ? `${added.amountText} added ${shortDay(added.addedAt, input.timeZone)}` : null;
    const shown = { ...base, value, valueText: valueText(key, value) };

    if (days > OLD_AFTER_DAYS[key]) {
      const whole = Math.floor(days);
      return {
        ...shown,
        state: "old",
        chip: `${whole} days ago`,
        note: OLD_AFTER_DAYS[key] <= 7 ? "Retest today" : "Retest this month",
      };
    }

    const level: Level | null = range ? levelOf(value, range) : null;
    let state: TileState = level ?? "ok";
    if (key === "fc" && value < input.fcMin) state = "too-low";
    else if (key === "fc" && value > input.fcSlam) state = "too-high";

    if (state === "too-low" || state === "too-high") {
      // Something added since the test is the action already taken; say that instead.
      const since = added && Date.parse(added.addedAt) > Date.parse(latest.taken_at);
      const action =
        state === "too-low"
          ? (input.fcAction ?? "Add chlorine now")
          : `Add nothing; swim once it is below ${input.fcSlam} ppm`;
      return { ...shown, state, chip: state === "too-low" ? "Too low" : "Too high", note: since ? addedText : action };
    }

    let note = addedText;
    const previous = tests[1];
    if (!note && previous) {
      const before = Number(previous[key]);
      // The change between the values as shown: pH keeps a second decimal when either test had one.
      const twoDecimals = (x: number) => Math.round(x * 100) % 10 !== 0;
      const decimals = key === "fc" ? 1 : key === "ph" ? (twoDecimals(value) || twoDecimals(before) ? 2 : 1) : 0;
      const shown = (x: number) => Math.round(x * 10 ** decimals);
      const steps = shown(value) - shown(before);
      const when = shortDay(previous.taken_at, input.timeZone);
      note = steps === 0 ? `No change since ${when}` : `${signed(steps / 10 ** decimals, decimals)} since ${when}`;
    }
    return { ...shown, state, chip: LEVEL_LABEL[level ?? "ok"], note };
  });
}

/** A test older than this many days gets a warning. */
export const STALE_TEST_DAYS = 7;

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

function localDate(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}

/**
 * "just now", "5 hours ago" (the same local day), "yesterday" (the local day before),
 * "3 days ago" (local calendar days, so a Thursday test reads "2 days ago" on Saturday
 * morning). `days` is the elapsed time, for staleness.
 */
export function ageText(takenAt: string, now: number, timeZone = "UTC"): { text: string; days: number } {
  const t = Date.parse(takenAt);
  const ms = Math.max(0, now - t);
  const days = ms / DAY_MS;
  if (ms < HOUR_MS) return { text: "just now", days };
  const calendarDays = Math.round(
    (Date.parse(`${localDate(now, timeZone)}T00:00:00Z`) - Date.parse(`${localDate(t, timeZone)}T00:00:00Z`)) / DAY_MS,
  );
  if (calendarDays <= 0) {
    const hours = Math.floor(ms / HOUR_MS);
    return { text: `${hours} ${hours === 1 ? "hour" : "hours"} ago`, days };
  }
  return { text: calendarDays === 1 ? "yesterday" : `${calendarDays} days ago`, days };
}

/** How old a test is, and whether it is stale (over a week). */
export function testAge(takenAt: string, now: number, timeZone = "UTC"): { text: string; days: number; stale: boolean } {
  const age = ageText(takenAt, now, timeZone);
  return { ...age, stale: age.days > STALE_TEST_DAYS };
}

export interface HistoryCell {
  key: keyof TileReading;
  /** Short name, as in the table header: "FC", "pH". */
  label: string;
  /** "5.0", "7.45", "80"; "—" when not tested. */
  text: string;
  /** Against the pool's target; null when not tested or without a target (salt on a chlorine pool). */
  level: Level | null;
}

const HISTORY: { key: keyof TileReading; label: string; decimals: number }[] = [
  { key: "fc", label: "FC", decimals: 1 },
  { key: "cc", label: "CC", decimals: 1 },
  { key: "ph", label: "pH", decimals: 1 },
  { key: "ta", label: "TA", decimals: 0 },
  { key: "ch", label: "CH", decimals: 0 },
  { key: "cya", label: "CYA", decimals: 0 },
  { key: "salt", label: "Salt", decimals: 0 },
];

/**
 * One past test for the history: each measure with its value and where it sat against
 * the pool's targets. pH keeps a second decimal when the tester gave one.
 */
export function historyCells(reading: TileReading, targets: TileTargets): HistoryCell[] {
  const ranges: Partial<Record<keyof TileReading, Range>> = { ...targets, cc: { low: 0, high: CC_MAX } };
  return HISTORY.map(({ key, label, decimals }) => {
    const raw = reading[key];
    const value = raw === null || raw === undefined ? null : Number(raw);
    const range = ranges[key];
    const text =
      value === null
        ? "—"
        : key === "ph"
          ? value.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 2 })
          : value.toFixed(decimals);
    return { key, label, text, level: value !== null && range ? levelOf(value, range) : null };
  });
}

/**
 * The line under the tiles, with whatever was logged: "Water 84 °F · CC 0.0 · CSI −0.24
 * (balanced)". Null when there is nothing to say.
 */
export function waterLine(parts: {
  temp: string | null;
  cc: number | null;
  csi: { value: number; verdict: string } | null;
}): string | null {
  const items: string[] = [];
  if (parts.temp) items.push(`Water ${parts.temp}`);
  if (parts.cc !== null) items.push(`CC ${parts.cc.toFixed(1)}`);
  if (parts.csi) {
    // Two decimals, as on the advice card, so the number and the verdict agree (−0.62 corrosive, −0.58 balanced).
    const v = Math.round(parts.csi.value * 100) / 100;
    items.push(`CSI ${v === 0 ? "0.00" : signed(v, 2)} (${parts.csi.verdict})`);
  }
  return items.length ? items.join(" · ") : null;
}
