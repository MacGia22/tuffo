import { carbonateAlkalinity, type WaterReading } from "./water";

export interface SaturationInput extends WaterReading {
  /** Calcium hardness, ppm as CaCO3. */
  ch: number;
  /** Water temperature, °C. */
  tempC: number;
  /** Total dissolved solids, ppm. Salt pools: use the salt reading plus about 700. */
  tds?: number;
  /** Salt, ppm; used to estimate TDS when tds is not given. */
  salt?: number;
}

/**
 * Calcite saturation index (the Langelier form, with alkalinity corrected for the
 * share carried by cyanuric acid and borates). Negative means the water tends to
 * dissolve plaster; positive means it tends to scale. Aim for about -0.3 to 0 on
 * plaster, and simply avoid strongly positive values on vinyl or fiberglass.
 */
export function saturationIndex(input: SaturationInput): number {
  const tds = input.tds ?? Math.max(1000, (input.salt ?? 0) + 700);
  const carbonateAlk = Math.max(1, carbonateAlkalinity(input));
  const ch = Math.max(1, input.ch);
  const tempK = input.tempC + 273.15;

  const a = (Math.log10(tds) - 1) / 10;
  const b = -13.12 * Math.log10(tempK) + 34.55;
  const c = Math.log10(ch) - 0.4;
  const d = Math.log10(carbonateAlk);

  const pHs = 9.3 + a + b - c - d;
  return input.pH - pHs;
}

export type SaturationVerdict = "corrosive" | "balanced" | "scaling";

export function saturationVerdict(csi: number): SaturationVerdict {
  if (csi < -0.6) return "corrosive";
  if (csi > 0.3) return "scaling";
  return "balanced";
}
