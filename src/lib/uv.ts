/**
 * UV index levels, the WHO categories on the rounded index. The chart's UV row, the
 * 7-day cards and the between-tests stats colour by these; the word always shows too.
 */

export type UvLevel = "low" | "moderate" | "high" | "very-high" | "extreme";

export const UV_LEVEL_LABEL: Record<UvLevel, string> = {
  low: "Low",
  moderate: "Moderate",
  high: "High",
  "very-high": "Very high",
  extreme: "Extreme",
};

export const UV_LEVELS: UvLevel[] = ["low", "moderate", "high", "very-high", "extreme"];

/** Low 0–2, Moderate 3–5, High 6–7, Very high 8–10, Extreme 11+, on the rounded index. */
export function uvLevel(index: number): UvLevel {
  const i = Math.round(index);
  if (i <= 2) return "low";
  if (i <= 5) return "moderate";
  if (i <= 7) return "high";
  if (i <= 10) return "very-high";
  return "extreme";
}

/** "7 · High" */
export function uvText(index: number): string {
  return `${Math.round(index)} · ${UV_LEVEL_LABEL[uvLevel(index)]}`;
}
