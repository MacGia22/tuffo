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
