/**
 * Weather cells: pools are grouped on a 0.03° grid (about 3 km, 2 miles) so one weather
 * fetch serves every pool in the cell and no precise location is ever stored. That is
 * about the resolution of the finest weather models behind Open-Meteo in the US (HRRR,
 * 3 km). Pools created before September 30, 2026 sit on the older 0.05° grid until
 * their owner picks the town again.
 */

export const CELL_DEGREES = 0.03;

export interface WeatherCell {
  id: string;
  lat: number;
  lon: number;
}

function snap(value: number): number {
  const snapped = Math.round(value / CELL_DEGREES) * CELL_DEGREES;
  const fixed = Number(snapped.toFixed(2));
  return Object.is(fixed, -0) ? 0 : fixed;
}

export function cellFor(lat: number, lon: number): WeatherCell {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error("cellFor: latitude and longitude must be finite numbers");
  }
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    throw new Error("cellFor: coordinates out of range");
  }
  const cellLat = snap(lat);
  let cellLon = snap(lon);
  if (cellLon === 180) cellLon = -180;
  return { id: `${cellLat.toFixed(2)},${cellLon.toFixed(2)}`, lat: cellLat, lon: cellLon };
}

/** The cell's square as [[south, west], [north, east]], for drawing it on a map. */
export function cellBounds(cell: Pick<WeatherCell, "lat" | "lon">): [[number, number], [number, number]] {
  const h = CELL_DEGREES / 2;
  return [
    [cell.lat - h, cell.lon - h],
    [cell.lat + h, cell.lon + h],
  ];
}

/**
 * The cells whose squares overlap a map view, or null when there would be more than
 * `max` (zoomed out too far to draw a grid).
 */
export function cellsInView(south: number, west: number, north: number, east: number, max = 600): WeatherCell[] | null {
  const lat0 = Math.ceil((Math.max(-90, south) - CELL_DEGREES / 2) / CELL_DEGREES);
  const lat1 = Math.floor((Math.min(90, north) + CELL_DEGREES / 2) / CELL_DEGREES);
  const lon0 = Math.ceil((west - CELL_DEGREES / 2) / CELL_DEGREES);
  const lon1 = Math.floor((east + CELL_DEGREES / 2) / CELL_DEGREES);
  const rows = lat1 - lat0 + 1;
  const cols = lon1 - lon0 + 1;
  if (rows <= 0 || cols <= 0) return [];
  if (rows * cols > max) return null;
  const out: WeatherCell[] = [];
  for (let i = lat0; i <= lat1; i++) {
    for (let j = lon0; j <= lon1; j++) {
      const lat = i * CELL_DEGREES;
      const lon = j * CELL_DEGREES;
      if (lat < -90 || lat > 90 || lon < -180 || lon > 180) continue;
      out.push(cellFor(lat, lon));
    }
  }
  return out;
}

/** A longitude in [-180, 180), e.g. 181.5 → -178.5 (a map scrolled past the antimeridian). */
export function wrapLon(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

/**
 * Whether a cell is within `degrees` of a point in both directions (the picked town). A
 * hair of slack for floating point, and longitudes compared across the antimeridian.
 */
export function cellNear(cell: Pick<WeatherCell, "lat" | "lon">, point: { lat: number; lon: number }, degrees = 0.3): boolean {
  const dLon = Math.abs(wrapLon(cell.lon - point.lon));
  return Math.abs(cell.lat - point.lat) <= degrees + 1e-9 && dLon <= degrees + 1e-9;
}
