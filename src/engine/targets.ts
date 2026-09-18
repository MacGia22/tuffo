/**
 * Free chlorine ranges as a function of cyanuric acid, following the relationship the
 * Trouble Free Pool community popularised: the higher the stabilizer, the more free
 * chlorine is needed to keep the same active fraction. Values are approximate and
 * should be validated against the published chart before release.
 */

export interface FcRange {
  /** Never let FC fall below this. */
  min: number;
  /** Everyday target band. */
  targetLow: number;
  targetHigh: number;
  /** Level for a SLAM (shock) when algae is present. */
  slam: number;
}

interface Row {
  cya: number;
  min: number;
  low: number;
  high: number;
}

// Manually chlorinated pools (liquid chlorine, cal-hypo, trichlor).
const MANUAL: Row[] = [
  { cya: 0, min: 1, low: 2, high: 3 },
  { cya: 20, min: 2, low: 3, high: 5 },
  { cya: 30, min: 2, low: 4, high: 6 },
  { cya: 40, min: 3, low: 5, high: 7 },
  { cya: 50, min: 4, low: 6, high: 8 },
  { cya: 60, min: 5, low: 7, high: 9 },
  { cya: 70, min: 5, low: 8, high: 10 },
  { cya: 80, min: 6, low: 9, high: 11 },
  { cya: 90, min: 7, low: 10, high: 12 },
  { cya: 100, min: 8, low: 11, high: 13 },
];

// Saltwater chlorine generator pools run lower because chlorine is added continuously.
const SWG: Row[] = [
  { cya: 0, min: 1, low: 2, high: 3 },
  { cya: 30, min: 2, low: 3, high: 4 },
  { cya: 50, min: 2, low: 3, high: 5 },
  { cya: 60, min: 2, low: 3, high: 5 },
  { cya: 70, min: 3, low: 4, high: 6 },
  { cya: 80, min: 4, low: 5, high: 7 },
  { cya: 90, min: 4, low: 5, high: 7 },
  { cya: 100, min: 5, low: 6, high: 8 },
];

function interpolate(rows: Row[], cya: number): Row {
  const c = Math.max(0, Math.min(cya, rows[rows.length - 1].cya));
  for (let i = 1; i < rows.length; i += 1) {
    const a = rows[i - 1];
    const b = rows[i];
    if (c <= b.cya) {
      const t = (c - a.cya) / (b.cya - a.cya);
      return {
        cya: c,
        min: a.min + (b.min - a.min) * t,
        low: a.low + (b.low - a.low) * t,
        high: a.high + (b.high - a.high) * t,
      };
    }
  }
  return rows[rows.length - 1];
}

export function fcRange(cya: number, options: { swg?: boolean } = {}): FcRange {
  const row = interpolate(options.swg ? SWG : MANUAL, cya);
  const c = Math.max(0, Math.min(cya, 100));
  return {
    min: Math.round(row.min * 2) / 2,
    targetLow: Math.round(row.low * 2) / 2,
    targetHigh: Math.round(row.high * 2) / 2,
    // SLAM level is 40% of CYA, with a floor for unstabilised water.
    slam: Math.max(10, Math.round(c * 0.4)),
  };
}

export interface Targets {
  fc: FcRange;
  ph: { low: number; high: number; ideal: number };
  ta: { low: number; high: number };
  ch: { low: number; high: number };
  cya: { low: number; high: number };
  salt?: { low: number; high: number };
}

export interface PoolProfile {
  /** Saltwater chlorine generator. */
  swg?: boolean;
  /** Plaster, pebble or other calcium-based surface (needs calcium); vinyl and fiberglass do not. */
  surface?: "plaster" | "vinyl" | "fiberglass";
  cya: number;
}

/** Everyday targets for a pool, by sanitiser type and surface. */
export function targetsFor(pool: PoolProfile): Targets {
  const plaster = (pool.surface ?? "plaster") === "plaster";
  return {
    fc: fcRange(pool.cya, { swg: pool.swg }),
    ph: { low: 7.2, high: 7.8, ideal: 7.5 },
    ta: pool.swg ? { low: 60, high: 80 } : { low: 60, high: 90 },
    ch: plaster ? { low: 250, high: 450 } : { low: 100, high: 350 },
    cya: pool.swg ? { low: 60, high: 80 } : { low: 30, high: 50 },
    salt: pool.swg ? { low: 2800, high: 3600 } : undefined,
  };
}
