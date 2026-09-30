/**
 * Salt chlorine generator output over time. A cell makes its rated output only while it
 * runs at 100% with water flowing, so what reaches the pool per day is
 *
 *   rated ppm/day × setting % × hours the cell runs ÷ 24
 *
 * and between two tests the settings and pump schedules in force are integrated piece by
 * piece. Pure; no I/O.
 */

const DAY_MS = 86_400_000;

export interface Timed<T> {
  /** ISO instant the value took effect. */
  at: string;
  value: T;
}

/** The value in force at an instant: the latest one at or before it, or null. */
function inForce<T>(items: Timed<T>[], ms: number): T | null {
  let best: Timed<T> | null = null;
  for (const item of items) {
    const t = Date.parse(item.at);
    if (t <= ms && (!best || t >= Date.parse(best.at))) best = item;
  }
  return best ? best.value : null;
}

/**
 * Free chlorine the cell added between two instants, ppm, from its rated output (ppm/day
 * in this pool at 100% round the clock), the settings (%) and cell hours per day in force
 * over the interval. Null when either is unknown at the start: the model then leaves the
 * pair out rather than guess.
 */
export function cellPpmBetween(input: {
  ratedPpmPerDay: number;
  settings: Timed<number>[];
  hours: Timed<number>[];
  from: string;
  to: string;
}): number | null {
  const t0 = Date.parse(input.from);
  const t1 = Date.parse(input.to);
  if (!(t1 > t0)) return 0;
  if (inForce(input.settings, t0) === null || inForce(input.hours, t0) === null) return null;
  const changes = [...input.settings, ...input.hours]
    .map((x) => Date.parse(x.at))
    .filter((t) => t > t0 && t < t1);
  const cuts = [t0, ...new Set(changes)].sort((a, b) => a - b);
  cuts.push(t1);
  let ppm = 0;
  for (let i = 0; i < cuts.length - 1; i += 1) {
    const percent = inForce(input.settings, cuts[i]) ?? 0;
    const hours = inForce(input.hours, cuts[i]) ?? 0;
    const days = (cuts[i + 1] - cuts[i]) / DAY_MS;
    ppm += input.ratedPpmPerDay * (Math.min(100, Math.max(0, percent)) / 100) * (Math.min(24, Math.max(0, hours)) / 24) * days;
  }
  return ppm;
}
