/** Axis helpers for the hand-drawn SVG charts. */

/** The smallest "round" step (1, 2, 2.5, 5 × 10^n) at least as large as `raw`. */
export function niceStep(raw: number): number {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const power = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * power >= raw - 1e-12) return m * power;
  return 10 * power;
}

/**
 * Round ticks that always enclose [min, max], so the domain (first to last tick)
 * never cuts data off. `target` is the rough number of intervals wanted.
 */
export function ticks(min: number, max: number, target: number): number[] {
  const step = niceStep((max - min) / target);
  const lo = Math.floor(min / step + 1e-9) * step;
  const hi = Math.ceil(max / step - 1e-9) * step;
  const count = Math.max(1, Math.round((hi - lo) / step));
  return Array.from({ length: count + 1 }, (_, i) => Number((lo + i * step).toFixed(3)));
}

/**
 * Round ticks inside [min, max] only, for small panels whose domain follows the
 * data (the top of the panel need not be a gridline).
 */
export function innerTicks(min: number, max: number, target: number): number[] {
  const step = niceStep((max - min) / target);
  const first = Math.ceil(min / step - 1e-9);
  const last = Math.floor(max / step + 1e-9);
  return Array.from({ length: Math.max(0, last - first + 1) }, (_, i) => Number(((first + i) * step).toFixed(3)));
}
