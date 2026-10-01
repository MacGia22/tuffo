/**
 * The status tiles at the top of a pool: each measure from the latest test against the
 * pool's target range, as low / OK / high with the range itself, and how old the test is.
 * Pure; browser-safe.
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

export interface Tile {
  key: string;
  label: string;
  value: number | null;
  unit: string;
  level: Level | null;
  /** "3–4.5 ppm"; null when the measure has no target (water temperature). */
  range: string | null;
}

/** Combined chlorine above this is worth acting on. */
export const CC_MAX = 0.5;

/**
 * The tiles for a test, in a fixed order. Salt shows for salt pools; combined chlorine
 * only when it was logged. A measure not in this test shows "—" without a status.
 */
export function tilesFor(reading: TileReading, targets: TileTargets, options: { swg: boolean }): Tile[] {
  const tile = (key: keyof TileReading, label: string, unit: string, range: Range | undefined): Tile => {
    const raw = reading[key];
    const value = raw === null || raw === undefined ? null : Number(raw);
    return {
      key,
      label,
      value,
      unit,
      level: value !== null && range ? levelOf(value, range) : null,
      range: range ? `${rangeText(range)}${unit ? ` ${unit}` : ""}` : null,
    };
  };
  const tiles = [
    tile("fc", "Free chlorine", "ppm", targets.fc),
    tile("ph", "pH", "", targets.ph),
    tile("ta", "Alkalinity", "ppm", targets.ta),
    tile("ch", "Calcium", "ppm", targets.ch),
    tile("cya", "Stabilizer", "ppm", targets.cya),
  ];
  if (options.swg) tiles.push(tile("salt", "Salt", "ppm", targets.salt));
  if (reading.cc !== null && reading.cc !== undefined) tiles.push(tile("cc", "Combined chlorine", "ppm", { low: 0, high: CC_MAX }));
  return tiles;
}

/** A test older than this many days gets a warning. */
export const STALE_TEST_DAYS = 7;

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** "just now", "5 hours ago", "yesterday", "3 days ago"; stale after a week. */
export function testAge(takenAt: string, now: number): { text: string; days: number; stale: boolean } {
  const ms = Math.max(0, now - Date.parse(takenAt));
  const days = ms / DAY_MS;
  let text: string;
  if (ms < HOUR_MS) text = "just now";
  else if (ms < DAY_MS) {
    const hours = Math.floor(ms / HOUR_MS);
    text = `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  } else if (days < 2) text = "yesterday";
  else text = `${Math.floor(days)} days ago`;
  return { text, days, stale: days > STALE_TEST_DAYS };
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
