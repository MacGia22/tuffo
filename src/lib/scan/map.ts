/**
 * Turns the vision model's structured answer into the reading form's fields.
 * Pure, so it is unit-tested without the API.
 */

export interface ScanOutput {
  source?: string;
  readings?: Partial<Record<string, number | string | null>>;
  test_date?: string | null;
  confidence?: string;
  uncertain_fields?: string[];
  notes?: string;
}

export type ReadingMethod = "drop_kit" | "strips" | "digital" | "store_leslies" | "store_pinch" | "monitor" | "other";

export interface ScanResult {
  /** Field name → value, as the reading form names them; temperature in °C. */
  fields: Partial<Record<"fc" | "cc" | "ph" | "ta" | "ch" | "cya" | "salt" | "phosphate" | "borate" | "tds", number>>;
  waterTempC: number | null;
  method: ReadingMethod;
  testDate: string | null;
  confidence: "high" | "medium" | "low";
  uncertain: string[];
  notes: string | null;
  usage: { model: string; inputTokens: number; outputTokens: number };
}

const METHOD: Record<string, ReadingMethod> = {
  leslies: "store_leslies",
  pinch_a_penny: "store_pinch",
  other_store: "other",
  test_strip: "strips",
  test_kit: "drop_kit",
  digital_tester: "digital",
  unknown: "other",
};

const FIELD_NAMES: Record<string, keyof ScanResult["fields"]> = {
  free_chlorine_ppm: "fc",
  combined_chlorine_ppm: "cc",
  ph: "ph",
  total_alkalinity_ppm: "ta",
  calcium_hardness_ppm: "ch",
  cyanuric_acid_ppm: "cya",
  salt_ppm: "salt",
  phosphate_ppb: "phosphate",
  borate_ppm: "borate",
  tds_ppm: "tds",
};

const LIMITS: Record<keyof ScanResult["fields"], [number, number]> = {
  fc: [0, 100],
  cc: [0, 50],
  ph: [5, 10],
  ta: [0, 1000],
  ch: [0, 3000],
  cya: [0, 500],
  salt: [0, 20000],
  phosphate: [0, 20000],
  borate: [0, 200],
  tds: [0, 50000],
};

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) && value.trim() !== "" ? parsed : null;
  }
  return null;
}

function round(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

export function mapScan(output: ScanOutput, usage: ScanResult["usage"]): ScanResult {
  const r = output.readings ?? {};
  const fields: ScanResult["fields"] = {};
  const uncertain = new Set((output.uncertain_fields ?? []).map((f) => FIELD_NAMES[f] ?? f));

  for (const [key, name] of Object.entries(FIELD_NAMES)) {
    const value = num(r[key]);
    if (value === null) continue;
    const [min, max] = LIMITS[name];
    if (value < min || value > max) {
      uncertain.add(name);
      continue;
    }
    fields[name] = round(value, name === "ph" ? 2 : 1);
  }

  // Combined chlorine from total minus free when the report prints total.
  if (fields.cc === undefined) {
    const total = num(r.total_chlorine_ppm);
    if (total !== null && fields.fc !== undefined) fields.cc = round(Math.max(0, total - fields.fc), 1);
  }

  let waterTempC: number | null = null;
  const temp = num(r.water_temperature);
  if (temp !== null) {
    const unit = r.water_temperature_unit === "C" ? "C" : r.water_temperature_unit === "F" ? "F" : temp > 45 ? "F" : "C";
    const celsius = unit === "F" ? ((temp - 32) * 5) / 9 : temp;
    if (celsius >= -5 && celsius <= 60) waterTempC = round(celsius, 1);
  }

  const confidence = output.confidence === "high" || output.confidence === "medium" ? output.confidence : "low";
  const testDate = typeof output.test_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(output.test_date) ? output.test_date : null;
  const notes = typeof output.notes === "string" && output.notes.trim() ? output.notes.trim().slice(0, 300) : null;

  return {
    fields,
    waterTempC,
    method: METHOD[output.source ?? "unknown"] ?? "other",
    testDate,
    confidence,
    uncertain: [...uncertain],
    notes,
    usage,
  };
}
