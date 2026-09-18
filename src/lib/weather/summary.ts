/**
 * Small, pure summaries of stored weather for the pool page. Safe in any component.
 */

export interface WeatherDay {
  date: string; // YYYY-MM-DD
  tmax_c: number | null;
  tmin_c: number | null;
  uv_index_max: number | null;
  sunshine_s: number | null;
  precipitation_mm: number | null;
  precipitation_probability?: number | null;
}

export interface BetweenSummary {
  /** Whole days between the two tests, at least 1. */
  days: number;
  /** Free chlorine lost per day, ppm; null when either test lacks FC. Doses are not yet subtracted. */
  fcLossPerDay: number | null;
  /** Averages over the days with data; null when no weather rows exist. */
  avgUvMax: number | null;
  avgTmaxC: number | null;
  sunshineHours: number | null;
  rainMm: number | null;
  daysWithWeather: number;
}

function mean(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

export function summarizeBetween(
  previous: { taken_at: string; fc: number | null },
  latest: { taken_at: string; fc: number | null },
  weather: WeatherDay[],
): BetweenSummary {
  const ms = new Date(latest.taken_at).getTime() - new Date(previous.taken_at).getTime();
  const days = Math.max(1, Math.round(ms / 86_400_000));
  const fcLossPerDay =
    previous.fc !== null && latest.fc !== null ? Math.max(0, (previous.fc - latest.fc) / (ms / 86_400_000)) : null;

  const uv = weather.map((d) => d.uv_index_max).filter((v): v is number => v !== null);
  const tmax = weather.map((d) => d.tmax_c).filter((v): v is number => v !== null);
  const sun = weather.map((d) => d.sunshine_s).filter((v): v is number => v !== null);
  const rain = weather.map((d) => d.precipitation_mm).filter((v): v is number => v !== null);

  return {
    days,
    fcLossPerDay: fcLossPerDay === null ? null : Math.round(fcLossPerDay * 100) / 100,
    avgUvMax: mean(uv) === null ? null : Math.round((mean(uv) as number) * 10) / 10,
    avgTmaxC: mean(tmax) === null ? null : Math.round((mean(tmax) as number) * 10) / 10,
    sunshineHours: sun.length ? Math.round((sun.reduce((a, b) => a + b, 0) / 3600) * 10) / 10 : null,
    rainMm: rain.length ? Math.round(rain.reduce((a, b) => a + b, 0) * 10) / 10 : null,
    daysWithWeather: weather.length,
  };
}

/** The dates (YYYY-MM-DD, local to the pool) covered by two timestamps, inclusive. */
export function localDateRange(fromIso: string, toIso: string, timeZone: string): { from: string; to: string } {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  return { from: fmt.format(new Date(fromIso)), to: fmt.format(new Date(toIso)) };
}

/** A short verdict on the sun load, for a sentence in the UI. */
export function sunVerdict(avgUvMax: number | null): string {
  if (avgUvMax === null) return "";
  if (avgUvMax >= 9) return "very strong sun";
  if (avgUvMax >= 7) return "strong sun";
  if (avgUvMax >= 4) return "moderate sun";
  return "weak sun";
}
