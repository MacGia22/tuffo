/**
 * Screen enclosures ("pool cages", lanais): the kinds the settings card offers and the
 * share of the sun each typically lets through. The owner can type their own share.
 * Safe in client components.
 */

export type EnclosureKind = "screen" | "fine_screen" | "solar_screen" | "other";

export const ENCLOSURES: { value: EnclosureKind; label: string; sunPct: number }[] = [
  // Standard 18×14 pool screen blocks roughly 25–30% of the sun.
  { value: "screen", label: "Standard pool screen", sunPct: 70 },
  // Finer "no-see-um" mesh (20×20) blocks about 40–50%.
  { value: "fine_screen", label: "Fine “no-see-um” screen", sunPct: 55 },
  // Solar or privacy screen blocks most of it.
  { value: "solar_screen", label: "Solar or privacy screen", sunPct: 30 },
  { value: "other", label: "Other or partly roofed", sunPct: 50 },
];

export function isEnclosureKind(value: unknown): value is EnclosureKind {
  return ENCLOSURES.some((e) => e.value === value);
}

export function suggestedSunPct(kind: EnclosureKind): number {
  return ENCLOSURES.find((e) => e.value === kind)?.sunPct ?? 100;
}

export type EnclosureInput =
  | { ok: true; enclosure: EnclosureKind | null; sunPct: number | null }
  | { ok: false; error: string; field: string };

/** The settings form's values: no enclosure, or a kind with a sun share of 5–100%. */
export function readEnclosure(kindRaw: string, pctRaw: string): EnclosureInput {
  if (!kindRaw || kindRaw === "none") return { ok: true, enclosure: null, sunPct: null };
  if (!isEnclosureKind(kindRaw)) return { ok: false, error: "Pick the kind of enclosure.", field: "enclosure" };
  const text = pctRaw.trim();
  if (text === "") return { ok: true, enclosure: kindRaw, sunPct: suggestedSunPct(kindRaw) };
  const pct = Number(text.replace(/%$/, ""));
  if (!Number.isFinite(pct) || pct < 5 || pct > 100) {
    return { ok: false, error: "Sun through the screen must be between 5% and 100%.", field: "sun_pct" };
  }
  return { ok: true, enclosure: kindRaw, sunPct: Math.round(pct) };
}
