import { uvLevel, uvText, type UvLevel } from "@/lib/uv";

/** Fill and text per UV level (tokens in globals.css; text 4.5:1 or more on each fill). */
export const UV_CLASS: Record<UvLevel, string> = {
  low: "bg-uv-low text-uv-low-fg",
  moderate: "bg-uv-moderate text-uv-moderate-fg",
  high: "bg-uv-high text-uv-high-fg",
  "very-high": "bg-uv-very-high text-uv-very-high-fg",
  extreme: "bg-uv-extreme text-uv-extreme-fg",
};

/** "UV 7 · High" in the level's colour. */
export function UvChip({ index }: { index: number }) {
  return (
    <span className={`inline-block self-start rounded-xl border border-uv-border px-2 py-0.5 text-xs font-semibold leading-tight ${UV_CLASS[uvLevel(index)]}`}>
      UV {uvText(index)}
    </span>
  );
}
