import { cellFor } from "@/lib/weather/cells";
import type { Units } from "@/lib/format";

/**
 * The public forecast's inputs, read from and written to its URL so a result can be
 * shared: /forecast?place=<label>&lat=<cell lat>&lon=<cell lon>&v=<liters>&cya=<n>&s=chlorine|salt&u=us|metric.
 * Coordinates are always the weather cell's center, never the point a town was found at.
 * Pure; safe in client components.
 */

export type Sanitizer = "chlorine" | "salt";

export interface ForecastInput {
  place: string;
  /** Weather cell center (0.03° grid). */
  lat: number;
  lon: number;
  volumeL: number;
  cya: number;
  sanitizer: Sanitizer;
  units: Units;
}

const LITERS_PER_US_GALLON = 3.785411784;

/** 15,000 gal; 57,000 L for metric visitors. */
export const DEFAULT_VOLUME_GAL = 15_000;
export const DEFAULT_VOLUME_L_METRIC = 57_000;
export const DEFAULT_CYA = 40;
/** A pool, not a bucket or a lake: about 260 to 260,000 gal. */
export const MIN_VOLUME_L = 1_000;
export const MAX_VOLUME_L = 1_000_000;
/** Above 100 ppm the answer is to drain some water, not a plan. */
export const MAX_CYA = 100;
export const MAX_PLACE_LENGTH = 120;

/** US places get US units; everywhere else metric. Labels end in ", US" for US places. */
export function defaultUnits(place: string): Units {
  return /,\s*US$/.test(place.trim()) ? "us" : "metric";
}

export function defaultVolumeL(units: Units): number {
  return units === "us" ? Math.round(DEFAULT_VOLUME_GAL * LITERS_PER_US_GALLON) : DEFAULT_VOLUME_L_METRIC;
}

export type ParseResult =
  | { ok: true; input: ForecastInput; notices: string[]; /** The URL had a point off the grid: send them to this one. */ canonical: string | null }
  | { ok: false; reason: "no-place" | "bad-place" };

type Params = Record<string, string | string[] | undefined>;

function one(params: Params, key: string): string | null {
  const value = params[key];
  const v = Array.isArray(value) ? value[0] : value;
  return typeof v === "string" ? v.trim() : null;
}

/** A number as typed in a URL ("57,000" included), or null. */
export function parseNumber(value: string | null): number | null {
  if (value === null || value === "") return null;
  const n = Number(value.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** The place label as shown: printable characters only, collapsed spaces, at most 120. */
export function cleanPlace(value: string | null): string | null {
  if (!value) return null;
  const label = value.replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, MAX_PLACE_LENGTH);
  return label.length >= 2 ? label : null;
}

function formatVolume(liters: number, units: Units): string {
  const v = units === "us" ? liters / LITERS_PER_US_GALLON : liters;
  return `${(Math.round(v / 100) * 100).toLocaleString("en-US")} ${units === "us" ? "gal" : "L"}`;
}

/**
 * Reads the inputs. A missing or broken place means no forecast; a bad volume, CYA or
 * sanitizer falls back to the default with a notice, so a mangled shared link still
 * shows a week.
 */
export function parseForecastParams(params: Params): ParseResult {
  const placeRaw = one(params, "place");
  const latRaw = one(params, "lat");
  const lonRaw = one(params, "lon");
  if (!placeRaw && !latRaw && !lonRaw) return { ok: false, reason: "no-place" };

  const place = cleanPlace(placeRaw);
  const lat = parseNumber(latRaw);
  const lon = parseNumber(lonRaw);
  if (!place || lat === null || lon === null) return { ok: false, reason: "bad-place" };
  let cell;
  try {
    cell = cellFor(lat, lon);
  } catch {
    return { ok: false, reason: "bad-place" };
  }

  const u = one(params, "u");
  const units: Units = u === "us" || u === "metric" ? u : defaultUnits(place);
  const notices: string[] = [];

  let volumeL = defaultVolumeL(units);
  const vRaw = one(params, "v");
  if (vRaw !== null && vRaw !== "") {
    const v = parseNumber(vRaw);
    if (v === null) notices.push(`The pool volume was not a number; using ${formatVolume(volumeL, units)}.`);
    else if (v < MIN_VOLUME_L || v > MAX_VOLUME_L)
      notices.push(
        `Pool volume must be between ${formatVolume(MIN_VOLUME_L, units)} and ${formatVolume(MAX_VOLUME_L, units)}; using ${formatVolume(volumeL, units)}.`,
      );
    else volumeL = Math.round(v);
  }

  let cya = DEFAULT_CYA;
  const cRaw = one(params, "cya");
  if (cRaw !== null && cRaw !== "") {
    const c = parseNumber(cRaw);
    if (c === null || c < 0 || c > MAX_CYA)
      notices.push(`Stabilizer (CYA) must be a number from 0 to ${MAX_CYA} ppm; using ${DEFAULT_CYA}.`);
    else cya = Math.round(c);
  }

  const s = one(params, "s");
  const sanitizer: Sanitizer = s === "salt" ? "salt" : "chlorine";

  const input: ForecastInput = { place, lat: cell.lat, lon: cell.lon, volumeL, cya, sanitizer, units };
  const offGrid = cell.lat !== lat || cell.lon !== lon;
  return { ok: true, input, notices, canonical: offGrid ? withCell(params, cell) : null };
}

/** The same query with the point replaced by its cell's center. */
function withCell(params: Params, cell: { lat: number; lon: number }): string {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const v = Array.isArray(value) ? value[0] : value;
    if (typeof v === "string") q.set(key, v);
  }
  q.set("lat", cell.lat.toFixed(2));
  q.set("lon", cell.lon.toFixed(2));
  return `/forecast?${q.toString()}`;
}

/** The result's URL. Only the weather cell's center goes in it. */
export function forecastHref(input: ForecastInput, extra: { ref?: string | null } = {}): string {
  const cell = cellFor(input.lat, input.lon);
  const q = new URLSearchParams();
  q.set("place", input.place);
  q.set("lat", cell.lat.toFixed(2));
  q.set("lon", cell.lon.toFixed(2));
  q.set("v", String(Math.round(input.volumeL)));
  q.set("cya", String(Math.round(input.cya)));
  q.set("s", input.sanitizer);
  if (input.units !== defaultUnits(input.place)) q.set("u", input.units);
  if (extra.ref) q.set("ref", extra.ref);
  return `/forecast?${q.toString()}`;
}

/**
 * "Track my pool": sign-in with the link's label (or "forecast"), then the new-pool form
 * filled with the place, its time zone, volume, sanitizer and CYA.
 */
export function signupHref(input: ForecastInput, options: { ref: string | null; timezone: string | null }): string {
  const cell = cellFor(input.lat, input.lon);
  const next = new URLSearchParams();
  next.set("place", input.place);
  next.set("lat", cell.lat.toFixed(2));
  next.set("lon", cell.lon.toFixed(2));
  if (options.timezone) next.set("tz", options.timezone);
  next.set("v", String(Math.round(input.volumeL)));
  next.set("cya", String(Math.round(input.cya)));
  next.set("s", input.sanitizer);
  next.set("u", input.units);
  const q = new URLSearchParams();
  q.set("ref", options.ref || "forecast");
  q.set("next", `/app/pools/new?${next.toString()}`);
  return `/login?${q.toString()}`;
}
