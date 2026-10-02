/** US places first (most visitors are in the US), the rest in the geocoder's own order. */
export function usFirst<T extends { country: string }>(places: T[]): T[] {
  return [...places.filter((p) => p.country === "US"), ...places.filter((p) => p.country !== "US")];
}

/** What the search status line announces. */
export function placesFoundText(count: number): string {
  if (count === 0) return "No places found, try the nearest town or the ZIP code.";
  return count === 1 ? "1 place found" : `${count} places found`;
}
