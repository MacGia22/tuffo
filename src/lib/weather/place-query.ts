/**
 * Turns what people type into geocoder queries and ranks what comes back.
 * Pure functions; the network call lives in geocode.ts.
 */

export const US_STATES: Record<string, string> = {
  al: "Alabama", ak: "Alaska", az: "Arizona", ar: "Arkansas", ca: "California", co: "Colorado",
  ct: "Connecticut", de: "Delaware", dc: "District of Columbia", fl: "Florida", ga: "Georgia",
  hi: "Hawaii", id: "Idaho", il: "Illinois", in: "Indiana", ia: "Iowa", ks: "Kansas", ky: "Kentucky",
  la: "Louisiana", me: "Maine", md: "Maryland", ma: "Massachusetts", mi: "Michigan", mn: "Minnesota",
  ms: "Mississippi", mo: "Missouri", mt: "Montana", ne: "Nebraska", nv: "Nevada", nh: "New Hampshire",
  nj: "New Jersey", nm: "New Mexico", ny: "New York", nc: "North Carolina", nd: "North Dakota",
  oh: "Ohio", ok: "Oklahoma", or: "Oregon", pa: "Pennsylvania", ri: "Rhode Island", sc: "South Carolina",
  sd: "South Dakota", tn: "Tennessee", tx: "Texas", ut: "Utah", vt: "Vermont", va: "Virginia",
  wa: "Washington", wv: "West Virginia", wi: "Wisconsin", wy: "Wyoming", pr: "Puerto Rico",
};

export interface ParsedQuery {
  /** What to send to the geocoder (one entry per spelling worth trying). */
  names: string[];
  /** "fl", "florida", "italy": a state, province or country the results must match. */
  qualifier: string | null;
  /** True when the whole query is a postal code. */
  postal: boolean;
}

const POSTAL = /^[A-Za-z0-9][A-Za-z0-9 -]{2,9}$/;
const HAS_DIGIT = /\d/;

function clean(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Spellings the GeoNames index may hold for the same name. */
export function nameVariants(name: string): string[] {
  const out = new Set<string>([name]);
  const stAtStart = /^(st|st\.)\s+/i;
  const saintAtStart = /^saint\s+/i;
  if (stAtStart.test(name)) {
    out.add(name.replace(stAtStart, "Saint "));
    out.add(name.replace(stAtStart, "St. "));
  } else if (saintAtStart.test(name)) {
    out.add(name.replace(saintAtStart, "St. "));
  }
  // Mid-name "St" ("Port St Lucie")
  const stInside = /\b(st|st\.)\s+/i;
  if (!stAtStart.test(name) && stInside.test(name)) {
    out.add(name.replace(stInside, "Saint "));
    out.add(name.replace(stInside, "St. "));
  }
  return [...out];
}

export function parseQuery(raw: string): ParsedQuery {
  const query = clean(raw);
  if (HAS_DIGIT.test(query) && POSTAL.test(query) && !/[a-z]{4,}/i.test(query)) {
    return { names: [query], qualifier: null, postal: true };
  }
  const parts = query.split(",").map(clean).filter(Boolean);
  const name = parts[0] ?? "";
  const qualifier = parts.length > 1 ? parts.slice(1).join(" ").toLowerCase() : null;
  return { names: nameVariants(name), qualifier, postal: false };
}

export interface GeoResult {
  name: string;
  latitude: number;
  longitude: number;
  timezone: string;
  country_code?: string;
  country?: string;
  admin1?: string;
  admin2?: string;
  feature_code?: string;
  population?: number;
}

function matchesQualifier(r: GeoResult, qualifier: string): boolean {
  const q = qualifier.toLowerCase().replace(/\./g, "");
  const candidates = [
    r.admin1?.toLowerCase(),
    r.country?.toLowerCase(),
    r.country_code?.toLowerCase(),
    r.country_code === "US" ? "usa" : undefined,
    r.country_code === "US" ? "united states" : undefined,
  ].filter(Boolean) as string[];
  if (candidates.includes(q)) return true;
  const state = US_STATES[q];
  if (state && r.country_code === "US" && r.admin1?.toLowerCase() === state.toLowerCase()) return true;
  return false;
}

/** Populated places first (bigger first), then regions; airports, hotels and the like last. */
function featureRank(code: string | undefined): number {
  if (!code) return 5;
  if (code.startsWith("PPL")) return 0;
  if (code.startsWith("ADM")) return 2;
  if (code === "AIRP" || code === "HTL" || code.startsWith("RSTN")) return 9;
  return 5;
}

export function rankResults(results: GeoResult[], qualifier: string | null): GeoResult[] {
  const seen = new Set<string>();
  const unique = results.filter((r) => {
    const key = `${r.latitude.toFixed(3)},${r.longitude.toFixed(3)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return Number.isFinite(r.latitude) && Number.isFinite(r.longitude) && Boolean(r.timezone);
  });

  const filtered = qualifier ? unique.filter((r) => matchesQualifier(r, qualifier)) : unique;
  const pool = filtered.length > 0 ? filtered : unique;

  const towns = pool.filter((r) => featureRank(r.feature_code) === 0);
  const rest = pool.filter((r) => featureRank(r.feature_code) !== 0);
  const byPop = (a: GeoResult, b: GeoResult) => (b.population ?? 0) - (a.population ?? 0);
  const byRank = (a: GeoResult, b: GeoResult) => featureRank(a.feature_code) - featureRank(b.feature_code) || byPop(a, b);
  // Keep places of other kinds only when there are no towns to show.
  return towns.length > 0 ? [...towns.sort(byPop), ...rest.filter((r) => featureRank(r.feature_code) <= 2).sort(byRank)] : rest.sort(byRank);
}

export function labelFor(r: GeoResult): string {
  return [r.name, r.admin1, r.country_code === "US" ? "US" : r.country]
    .filter((part, index, all) => part && all.indexOf(part) === index)
    .join(", ");
}
