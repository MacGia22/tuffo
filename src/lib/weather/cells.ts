/**
 * Weather cells: pools are grouped on a 0.05° grid (about 5 km) so one weather
 * fetch serves every pool in the cell and no precise location is ever stored.
 */

export const CELL_DEGREES = 0.05;

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
