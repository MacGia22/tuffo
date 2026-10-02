/**
 * Display formatting for the UI. Safe in client components: no engine imports.
 * The database stores SI (liters, °C); the user's profile picks US or metric.
 */

export type Units = "us" | "metric";

const LITERS_PER_US_GALLON = 3.785411784;

export function litersToDisplayVolume(liters: number, units: Units): number {
  return units === "us" ? liters / LITERS_PER_US_GALLON : liters;
}

export function displayVolumeToLiters(value: number, units: Units): number {
  return units === "us" ? value * LITERS_PER_US_GALLON : value;
}

export function volumeUnitLabel(units: Units): string {
  return units === "us" ? "gal" : "L";
}

export function formatVolume(liters: number, units: Units): string {
  const value = litersToDisplayVolume(liters, units);
  const rounded = value >= 1000 ? Math.round(value / 100) * 100 : Math.round(value);
  return `${rounded.toLocaleString("en-US")} ${volumeUnitLabel(units)}`;
}

const KPA_PER_PSI = 6.894757;

/** Filter gauge pressure: psi in US units, bar in metric (what gauges show). */
export function kpaToDisplayPressure(kpa: number, units: Units): number {
  return units === "us" ? kpa / KPA_PER_PSI : kpa / 100;
}

export function displayPressureToKpa(value: number, units: Units): number {
  return units === "us" ? value * KPA_PER_PSI : value * 100;
}

/**
 * A stored pressure as an edit field shows it: psi to 0.1, bar to 0.01, so saving an
 * unchanged field gives back the stored value (to a tenth of a kPa).
 */
export function pressureFieldValue(kpa: number, units: Units): string {
  const v = kpaToDisplayPressure(kpa, units);
  return String(units === "us" ? Math.round(v * 10) / 10 : Math.round(v * 100) / 100);
}

export function pressureUnitLabel(units: Units): string {
  return units === "us" ? "psi" : "bar";
}

export function formatPressure(kpa: number, units: Units): string {
  const v = kpaToDisplayPressure(kpa, units);
  return units === "us" ? `${Math.round(v)} psi` : `${(Math.round(v * 10) / 10).toFixed(1)} bar`;
}

export function formatTemperature(celsius: number, units: Units): string {
  return units === "us" ? `${Math.round((celsius * 9) / 5 + 32)} °F` : `${Math.round(celsius)} °C`;
}

export function formatDate(iso: string, timeZone?: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: timeZone ?? undefined,
  });
}

export function formatDateTime(iso: string, timeZone?: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timeZone ?? undefined,
  });
}

/** "Sep 27", in the pool's time zone. */
export function formatDay(iso: string, timeZone?: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: timeZone ?? undefined,
  });
}

/** How a reading was taken, as the reading form offers it. */
export const READING_METHODS = [
  { value: "drop_kit", label: "Drop test kit" },
  { value: "strips", label: "Test strips" },
  { value: "digital", label: "Digital tester" },
  { value: "store_leslies", label: "Leslie's store test" },
  { value: "store_pinch", label: "Pinch A Penny store test" },
  { value: "monitor", label: "Smart monitor" },
  { value: "other", label: "Other" },
] as const;

export function methodLabel(method: string): string {
  if (method === "imported") return "Imported";
  return READING_METHODS.find((m) => m.value === method)?.label ?? method.replace(/_/g, " ");
}

/** Below this much rain, and with a lower chance than this, a day reads "Dry". */
export const DRY_MM = 0.25;
export const DRY_CHANCE = 30;

/** Whether a day's rain (mm) and chance (percent, if forecast) read as dry. */
export function isDry(mm: number, chance: number | null | undefined): boolean {
  return mm < DRY_MM && (chance ?? 0) < DRY_CHANCE;
}

/**
 * Rain in the person's units without a misleading zero: inches to `inDecimals` (two when
 * that would show 0.0), mm whole (one decimal under 1 mm).
 */
export function formatRainAmount(mm: number, units: Units, inDecimals = 2): string {
  if (units === "us") {
    const inches = mm / 25.4;
    const decimals = inDecimals < 2 && inches > 0 && Number(inches.toFixed(inDecimals)) === 0 ? 2 : inDecimals;
    return `${inches.toFixed(decimals)} in`;
  }
  return `${mm > 0 && mm < 1 ? mm.toFixed(1) : Math.round(mm)} mm`;
}
