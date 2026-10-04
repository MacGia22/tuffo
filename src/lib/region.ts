/**
 * Where a pool is, coarsely, to list the equipment sold there first: Australia (and New
 * Zealand) or North America. Worked out from what Tuffo already has (the pool's time zone,
 * or the visitor's IP country for the order of a list); nothing is stored.
 */

export type Region = "AU" | "US";

export const REGION_LABELS: Record<Region, string> = { AU: "Common in Australia", US: "Common in the US" };

/** "Australia/Melbourne" → AU, "Pacific/Auckland" → AU, "America/New_York" → US; else null. */
export function regionForTimeZone(timeZone: string | null | undefined): Region | null {
  if (!timeZone) return null;
  if (timeZone.startsWith("Australia/") || timeZone === "Pacific/Auckland" || timeZone === "Pacific/Chatham") return "AU";
  if (timeZone.startsWith("America/") || timeZone === "Pacific/Honolulu") return "US";
  return null;
}

/** A two-letter country code → region; null elsewhere. */
export function regionForCountry(code: string | null | undefined): Region | null {
  const c = (code ?? "").toUpperCase();
  if (c === "AU" || c === "NZ") return "AU";
  if (c === "US" || c === "CA" || c === "MX" || c === "PR") return "US";
  return null;
}

/**
 * Catalog items in groups for a picker: the region's own first, then the rest under
 * "Other models", each in catalog order. Without a region, one group in catalog order.
 */
export function groupByRegion<T extends { region?: Region }>(items: T[], region: Region | null): { label: string | null; items: T[] }[] {
  if (!region) return [{ label: null, items }];
  const own = items.filter((i) => (i.region ?? "US") === region);
  const rest = items.filter((i) => (i.region ?? "US") !== region);
  return [
    { label: REGION_LABELS[region], items: own },
    { label: "Other models", items: rest },
  ].filter((g) => g.items.length > 0);
}
