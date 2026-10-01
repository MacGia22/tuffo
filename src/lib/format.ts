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
