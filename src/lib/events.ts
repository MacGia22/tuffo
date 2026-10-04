import { cellSettingText } from "@/lib/salt-cells";
import type { Units } from "@/lib/format";

/**
 * Things that happen to a pool besides tests and chemicals. Safe in client
 * components. Depths are stored in centimetres of water level.
 */

export type EventKind =
  | "refill"
  | "drain_refill"
  | "backwash"
  | "heavy_use"
  | "shock"
  | "cover_on"
  | "cover_off"
  | "other"
  | "cell_setting";

export interface EventKindInfo {
  kind: EventKind;
  label: string;
  /** What the optional number means for this kind. */
  value?: "depth" | "count" | "percent";
  /** Only for salt pools. */
  swgOnly?: boolean;
}

export const EVENT_KINDS: EventKindInfo[] = [
  { kind: "refill", label: "Topped up with fresh water", value: "depth" },
  { kind: "drain_refill", label: "Drained some water and refilled", value: "depth" },
  { kind: "backwash", label: "Backwashed or cleaned the filter" },
  { kind: "heavy_use", label: "Busy day in the pool", value: "count" },
  { kind: "shock", label: "Started a shock (SLAM)" },
  { kind: "cover_on", label: "Put the cover on" },
  { kind: "cover_off", label: "Took the cover off" },
  { kind: "cell_setting", label: "Changed the salt cell setting", value: "percent", swgOnly: true },
  { kind: "other", label: "Something else" },
];

const BY_KIND = new Map(EVENT_KINDS.map((e) => [e.kind, e]));

export function eventKindInfo(kind: string): EventKindInfo | undefined {
  return BY_KIND.get(kind as EventKind);
}

export const CM_PER_INCH = 2.54;

export function depthLabel(cm: number, units: Units): string {
  if (units === "us") {
    const inches = Math.round((cm / CM_PER_INCH) * 2) / 2;
    return `${inches.toLocaleString("en-US")} in`;
  }
  return `${Math.round(cm).toLocaleString("en-US")} cm`;
}

/** One line for the activity list. `levelCount`: the salt cell is set in levels 1 to that many. */
export function describeEvent(kind: string, value: number | null, units: Units, levelCount: number | null = null): string {
  switch (kind) {
    case "refill":
      return value ? `Topped up ${depthLabel(value, units)} of fresh water` : "Topped up with fresh water";
    case "drain_refill":
      return value ? `Drained and refilled ${depthLabel(value, units)}` : "Drained some water and refilled";
    case "cell_setting":
      return value === null ? "Changed the salt cell setting" : value <= 0 ? "Salt cell switched off" : `Salt cell set to ${cellSettingText(value, levelCount)}`;
    case "heavy_use":
      return value ? `Busy day, about ${Math.round(value)} swimmers` : "Busy day in the pool";
    default:
      return eventKindInfo(kind)?.label ?? "Something happened";
  }
}
