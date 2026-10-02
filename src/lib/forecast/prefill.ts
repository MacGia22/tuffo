import { litersToDisplayVolume, type Units } from "@/lib/format";
import { cellFor } from "@/lib/weather/cells";
import { cleanPlace, MAX_CYA, MAX_VOLUME_L, MIN_VOLUME_L, parseNumber } from "./params";

/**
 * The new-pool form's starting values when someone arrives from the public forecast:
 * /app/pools/new?place=&lat=&lon=&tz=&v=<liters>&s=chlorine|salt&u=&cya=. Same field
 * names as the form's own, so it fills in exactly as after a failed save. Pure.
 */

export interface PoolPrefill {
  units: Units;
  fields: Record<string, string>;
  /** Stabilizer the forecast used; not saved with the pool (it belongs to a test). */
  cya: number | null;
}

type Params = Record<string, string | string[] | undefined>;

function one(params: Params, key: string): string | null {
  const value = params[key];
  const v = Array.isArray(value) ? value[0] : value;
  return typeof v === "string" ? v.trim() : null;
}

function validTimeZone(tz: string | null): string | null {
  if (!tz || tz.length > 64) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return null;
  }
}

export function prefillFromForecast(params: Params): PoolPrefill | null {
  const place = cleanPlace(one(params, "place"));
  if (!place) return null;
  const u = one(params, "u");
  const units: Units = u === "metric" ? "metric" : "us";
  const fields: Record<string, string> = { units, query: place };

  const v = parseNumber(one(params, "v"));
  if (v !== null && v >= MIN_VOLUME_L && v <= MAX_VOLUME_L) {
    const shown = litersToDisplayVolume(v, units);
    fields.volume = String(Math.round(shown / 10) * 10);
  }
  if (one(params, "s") === "salt") fields.sanitizer = "swg";
  else fields.sanitizer = "chlorine";

  const lat = parseNumber(one(params, "lat"));
  const lon = parseNumber(one(params, "lon"));
  const tz = validTimeZone(one(params, "tz"));
  if (lat !== null && lon !== null && tz) {
    try {
      const cell = cellFor(lat, lon);
      fields.lat = String(cell.lat);
      fields.lon = String(cell.lon);
      fields.timezone = tz;
      fields.place_label = place;
    } catch {
      // A broken point: the person searches for the town again.
    }
  }

  const c = parseNumber(one(params, "cya"));
  return { units, fields, cya: c !== null && c >= 0 && c <= MAX_CYA ? Math.round(c) : null };
}

