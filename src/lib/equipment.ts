/**
 * Pool equipment besides the salt cell (which lives on the pool row): the pump, a
 * chlorine feeder, the filter and a heater. One current item per kind; replacing one
 * keeps the old one as history (removed_on). Browser-safe: the settings forms use it.
 *
 * Nothing here feeds the chlorine model yet. Feeders will, in a later step: tablets add
 * stabilizer with the chlorine and dosing pumps add a steady amount a day.
 */

import { displayVolumeToLiters, type Units } from "@/lib/format";
import { isSpeedUnit, type SpeedUnit } from "@/lib/pump";

export const EQUIPMENT_KINDS = ["pump", "feeder", "filter", "heater"] as const;
export type EquipmentKind = (typeof EQUIPMENT_KINDS)[number];

export const KIND_LABELS: Record<EquipmentKind, string> = {
  pump: "Pump",
  feeder: "Chlorine feeder",
  filter: "Filter",
  heater: "Heater",
};

export function isEquipmentKind(value: unknown): value is EquipmentKind {
  return typeof value === "string" && (EQUIPMENT_KINDS as readonly string[]).includes(value);
}

export type PumpSpeed = "variable" | "two" | "single";

export const PUMP_SPEEDS: { value: PumpSpeed; label: string }[] = [
  { value: "variable", label: "Variable speed" },
  { value: "two", label: "Two speed" },
  { value: "single", label: "Single speed" },
];

export interface PumpModel {
  id: string;
  name: string;
  speed: PumpSpeed;
  /**
   * How its schedule is usually set on its own control: speed (RPM), flow (GPM; L/min on
   * metric pools), speed in percent, or a numbered speed.
   */
  unit: SpeedUnit;
}

/** Common residential pumps. Anything else: "Another pump" with its name typed in. */
export const PUMP_MODELS: PumpModel[] = [
  { id: "pentair-intelliflo3-vsf", name: "Pentair IntelliFlo3 VSF", speed: "variable", unit: "gpm" },
  { id: "pentair-intelliflo-vsf", name: "Pentair IntelliFlo VSF", speed: "variable", unit: "gpm" },
  { id: "pentair-intelliflo-vs", name: "Pentair IntelliFlo VS", speed: "variable", unit: "rpm" },
  { id: "pentair-superflo-vs", name: "Pentair SuperFlo VS", speed: "variable", unit: "rpm" },
  { id: "pentair-whisperflo-xf-vs", name: "Pentair WhisperFloXF VS", speed: "variable", unit: "rpm" },
  { id: "pentair-superflo", name: "Pentair SuperFlo", speed: "single", unit: "rpm" },
  { id: "pentair-whisperflo", name: "Pentair WhisperFlo", speed: "single", unit: "rpm" },
  { id: "hayward-tristar-vs-950", name: "Hayward TriStar VS 950", speed: "variable", unit: "rpm" },
  { id: "hayward-maxflo-vs-500", name: "Hayward MaxFlo VS 500", speed: "variable", unit: "rpm" },
  { id: "hayward-super-pump-vs-700", name: "Hayward Super Pump VS 700", speed: "variable", unit: "rpm" },
  { id: "hayward-ecostar", name: "Hayward EcoStar", speed: "variable", unit: "rpm" },
  { id: "hayward-super-pump", name: "Hayward Super Pump", speed: "single", unit: "rpm" },
  { id: "hayward-maxflo-xl", name: "Hayward MaxFlo XL", speed: "single", unit: "rpm" },
  { id: "jandy-vs-flopro", name: "Jandy VS FloPro", speed: "variable", unit: "rpm" },
  { id: "jandy-epump", name: "Jandy ePump", speed: "variable", unit: "rpm" },
  // Australian pumps, from the makers' manuals and pages. Their presets (Low/Medium/High,
  // Eco/Clean/Boost) are set in RPM; the Davey ProMaster's dial is numbered 1 to 10.
  // https://daveywater.com/wp-content/uploads/2022/11/Pool_ProMaster_IOI.pdf ("Speed 1 being the slowest and speed 10 being the fastest")
  { id: "davey-promaster-pm200bt", name: "Davey ProMaster PM200BT", speed: "variable", unit: "level" },
  { id: "davey-promaster-pm400bt", name: "Davey ProMaster PM400BT", speed: "variable", unit: "level" },
  // https://daveywater.com/wp-content/uploads/2022/11/Pool_PowerMasterEco_IOI.pdf (Eco 1500 / Mid 2400 / High 2850 RPM)
  { id: "davey-powermaster-eco", name: "Davey PowerMaster ECO", speed: "variable", unit: "rpm" },
  // https://daveywater.com/au/product/powermaster/ ("single speed"), https://daveywater.com/au/product/silensor/
  { id: "davey-powermaster", name: "Davey PowerMaster", speed: "single", unit: "rpm" },
  { id: "davey-silensor", name: "Davey Silensor", speed: "single", unit: "rpm" },
  // https://www.waterco.com.au/waterco/manuals/pool-spa/pumps/ (ECO-V 100 and 150 instruction sheets, Sept 2022: presets in 25 RPM steps, RPM on the display)
  { id: "waterco-hydrostorm-eco-v-100", name: "Waterco Hydrostorm ECO-V 100", speed: "variable", unit: "rpm" },
  { id: "waterco-hydrostorm-eco-v-150", name: "Waterco Hydrostorm ECO-V 150", speed: "variable", unit: "rpm" },
  // https://www.waterco.com.au/waterco/brochures/pool-spa/pumps/high-performance-pump-zzb1285-2018.pdf (2860 RPM)
  { id: "waterco-hydrostorm-plus", name: "Waterco Hydrostorm Plus", speed: "single", unit: "rpm" },
  // https://s3-ap-southeast-2.amazonaws.com/astralpools-au/manuals/H0717700_REVA_Viron_XT_Installation.pdf ("settings per 25 rpm step", RPM on the LCD)
  { id: "astralpool-viron-p320-xt", name: "AstralPool Viron P320 XT", speed: "variable", unit: "rpm" },
  { id: "astralpool-viron-p520-xt", name: "AstralPool Viron P520 XT", speed: "variable", unit: "rpm" },
  // https://astralpools-au-2.s3.ap-southeast-2.amazonaws.com/Products/XP_Pump/Pumps%20Installation%20Manual%20-%20H0717800_REVB.PDF ("Operation at 2850 rpm")
  { id: "astralpool-e-series", name: "AstralPool E-Series", speed: "single", unit: "rpm" },
  { id: "astralpool-ctx", name: "AstralPool CTX-Series", speed: "single", unit: "rpm" },
  // https://s3-ap-southeast-2.amazonaws.com/zodiac-au/resources/Zodiac_FloPro_E3_Manual_H0394700_REVD.PDF (Eco 1400 / Clean 2150 / Boost 2850 RPM, 50 RPM steps)
  { id: "zodiac-flopro-e3", name: "Zodiac FloPro E3", speed: "variable", unit: "rpm" },
  // https://www.zodiac.com.au/products/pool-pumps/single-speed/flopro-ss-pool-pump (listed under single speed)
  { id: "zodiac-flopro-ss", name: "Zodiac FloPro SS", speed: "single", unit: "rpm" },
];

export type FeederType = "floater" | "inline" | "liquid" | "controller";

export const FEEDER_TYPES: { value: FeederType; label: string }[] = [
  { value: "floater", label: "Tablet floater" },
  { value: "inline", label: "Inline tablet chlorinator" },
  { value: "liquid", label: "Liquid chlorine dosing pump" },
  { value: "controller", label: "Automatic chlorine/pH controller" },
];

export type FilterType = "sand" | "cartridge" | "de";

export const FILTER_TYPES: { value: FilterType; label: string }[] = [
  { value: "sand", label: "Sand" },
  { value: "cartridge", label: "Cartridge" },
  { value: "de", label: "DE (diatomaceous earth)" },
];

export type HeaterType = "heat_pump" | "gas" | "solar" | "electric";

export const HEATER_TYPES: { value: HeaterType; label: string }[] = [
  { value: "heat_pump", label: "Heat pump" },
  { value: "gas", label: "Gas" },
  { value: "solar", label: "Solar" },
  { value: "electric", label: "Electric" },
];

export type EquipmentDetails =
  | { speed: PumpSpeed; catalog: string | null; unit?: SpeedUnit }
  | { type: FeederType; setting: string | null }
  | { type: FilterType }
  | { type: HeaterType; inUse: boolean };

export type EquipmentInput =
  | { ok: true; kind: EquipmentKind; model: string | null; details: EquipmentDetails }
  | { ok: false; error: string; field: string };

const MODEL_MAX = 80;
const SETTING_MAX = 40;

function clean(value: string | null | undefined, max: number): string | null {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, max) : null;
}

function pick<T extends string>(options: { value: T }[], value: string | null): T | null {
  return options.find((o) => o.value === value)?.value ?? null;
}

/** One piece of equipment from its settings form. `get` reads a form field by name. */
export function equipmentFromForm(kind: EquipmentKind, get: (name: string) => string | null): EquipmentInput {
  if (kind === "pump") {
    const choice = get("catalog");
    const listed = PUMP_MODELS.find((p) => p.id === choice);
    if (listed) return { ok: true, kind, model: listed.name, details: { speed: listed.speed, catalog: listed.id } };
    if (choice !== "other") return { ok: false, error: "Pick your pump, or choose “Another pump”.", field: "catalog" };
    const speed = pick(PUMP_SPEEDS, get("speed"));
    if (!speed) return { ok: false, error: "Pick the pump's speed type.", field: "speed" };
    const unit = get("unit");
    return {
      ok: true,
      kind,
      model: clean(get("model"), MODEL_MAX),
      details: { speed, catalog: null, ...(isSpeedUnit(unit) ? { unit } : {}) },
    };
  }
  if (kind === "feeder") {
    const type = pick(FEEDER_TYPES, get("type"));
    if (!type) return { ok: false, error: "Pick the kind of feeder.", field: "type" };
    return { ok: true, kind, model: clean(get("model"), MODEL_MAX), details: { type, setting: clean(get("setting"), SETTING_MAX) } };
  }
  if (kind === "filter") {
    const type = pick(FILTER_TYPES, get("type"));
    if (!type) return { ok: false, error: "Pick the kind of filter.", field: "type" };
    return { ok: true, kind, model: clean(get("model"), MODEL_MAX), details: { type } };
  }
  const type = pick(HEATER_TYPES, get("type"));
  if (!type) return { ok: false, error: "Pick the kind of heater.", field: "type" };
  const inUse = get("in_use") === "on";
  return { ok: true, kind, model: clean(get("model"), MODEL_MAX), details: { type, inUse } };
}

/** A one-line description of a saved item, for the settings page and its history. */
export function describeEquipment(kind: EquipmentKind, model: string | null, details: unknown): string {
  const d = (details ?? {}) as Record<string, unknown>;
  const label = (options: { value: string; label: string }[], value: unknown) =>
    options.find((o) => o.value === value)?.label ?? null;
  const parts: (string | null)[] = [model];
  if (kind === "pump") {
    if (!d.catalog) parts.push(label(PUMP_SPEEDS, d.speed)?.toLowerCase() ?? null);
  } else if (kind === "feeder") {
    parts.unshift(label(FEEDER_TYPES, d.type));
    if (typeof d.setting === "string" && d.setting) parts.push(`set to ${d.setting}`);
  } else if (kind === "filter") {
    parts.unshift(`${label(FILTER_TYPES, d.type) ?? "Filter"} filter`);
  } else {
    parts.unshift(label(HEATER_TYPES, d.type));
    parts.push(d.inUse ? "in use" : "not in use");
  }
  return parts.filter(Boolean).join(", ") || KIND_LABELS[kind];
}

/**
 * The schedule unit a pump is usually set in (GPM for Pentair VSF pumps), or null. A flow
 * pump on a metric pool is set in L/min.
 */
export function pumpScheduleUnit(details: unknown, units: Units = "us"): SpeedUnit | null {
  const d = (details ?? {}) as { catalog?: unknown; unit?: unknown };
  const unit = PUMP_MODELS.find((p) => p.id === d.catalog)?.unit ?? (isSpeedUnit(d.unit) ? d.unit : null);
  return unit === "gpm" && units === "metric" ? "lpm" : unit;
}

export const SURFACES = [
  { value: "plaster", label: "Plaster, pebble or tile" },
  { value: "vinyl", label: "Vinyl liner" },
  { value: "fiberglass", label: "Fiberglass" },
] as const;

export type BasicsInput =
  | {
      ok: true;
      name: string;
      volumeL: number;
      sanitizer: "chlorine" | "swg";
      surface: "plaster" | "vinyl" | "fiberglass";
      covered: boolean;
    }
  | { ok: false; error: string; field: string };

/** The pool's basics from the settings form, with the volume in liters. */
export function basicsFromForm(get: (name: string) => string | null): BasicsInput {
  const name = clean(get("name"), 200) ?? "";
  if (name.length < 1 || name.length > 80) return { ok: false, error: "Give the pool a name (up to 80 characters).", field: "name" };
  const units: Units = get("units") === "metric" ? "metric" : "us";
  const raw = (get("volume") ?? "").replace(/,/g, "").trim();
  const volume = raw === "" ? NaN : Number(raw);
  if (!Number.isFinite(volume) || volume <= 0) return { ok: false, error: "Enter the pool volume.", field: "volume" };
  const volumeL = Math.round(displayVolumeToLiters(volume, units));
  if (volumeL < 500 || volumeL > 5_000_000) return { ok: false, error: "That volume does not look right for a pool.", field: "volume" };
  const sanitizer = get("sanitizer");
  if (sanitizer !== "chlorine" && sanitizer !== "swg") return { ok: false, error: "Pick a sanitizer.", field: "sanitizer" };
  const surface = SURFACES.find((s) => s.value === get("surface"))?.value;
  if (!surface) return { ok: false, error: "Pick a surface.", field: "surface" };
  return { ok: true, name, volumeL, sanitizer, surface, covered: get("covered") === "on" };
}
