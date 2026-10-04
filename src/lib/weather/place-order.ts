/**
 * Places in the visitor's country first, then US places (most visitors are in the US),
 * then the rest, each group in the geocoder's own order. `visitor` is a two-letter code
 * or null when unknown.
 */
export function placesInOrder<T extends { country: string }>(places: T[], visitor: string | null = null): T[] {
  const rank = (p: T) => (visitor && p.country === visitor ? 0 : p.country === "US" ? 1 : 2);
  return places
    .map((p, i) => ({ p, i }))
    .sort((a, b) => rank(a.p) - rank(b.p) || a.i - b.i)
    .map(({ p }) => p);
}

/** The visitor's country from the x-vercel-ip-country header: two letters, else null. */
export function visitorCountry(header: string | null | undefined): string | null {
  const code = (header ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) && code !== "XX" ? code : null;
}

/** What the search status line announces. */
export function placesFoundText(count: number): string {
  if (count === 0) return "No places found, try the nearest town or the ZIP code.";
  return count === 1 ? "1 place found" : `${count} places found`;
}
