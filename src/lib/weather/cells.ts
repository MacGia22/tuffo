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
