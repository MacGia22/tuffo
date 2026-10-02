import { StatusChip } from "@/components/status-chip";
import type { WaterTile } from "@/lib/tiles";

const BORDER: Record<WaterTile["state"], string> = {
  ok: "border border-border",
  high: "border border-border",
  low: "border border-border",
  old: "border border-border",
  "too-low": "border-2 border-chip-critical-border",
  "too-high": "border-2 border-chip-critical-border",
  none: "border border-dashed border-muted/60",
};

/**
 * "Water now": one tile per measure with its value, a status chip, the target and one
 * line of context; under the grid, water temperature, combined chlorine and CSI.
 */
export function WaterNow({ tiles, line }: { tiles: WaterTile[]; line: string | null }) {
  return (
    <section id="water" aria-labelledby="water-title" className="flex flex-col gap-3">
      <h2 id="water-title" className="text-xl font-semibold">
        Water now
      </h2>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 lg:gap-2.5">
        {tiles.map((tile) => (
          <li key={tile.key} className={`flex flex-col gap-1.5 rounded-2xl bg-surface p-3.5 ${BORDER[tile.state]}`}>
            {/* Sentence case, never transformed: "pH" stays "pH". */}
            <span className="text-[13px] font-semibold text-muted">{tile.label}</span>
            <span className="font-display text-[28px] font-bold leading-tight tabular-nums">
              {tile.valueText}
              {tile.unit && tile.value !== null ? <span className="ml-1 font-sans text-sm font-semibold text-muted">{tile.unit}</span> : null}
            </span>
            <StatusChip state={tile.state} text={tile.chip} />
            {tile.target ? <span className="text-xs text-muted">{tile.target}</span> : null}
            {tile.note ? (
              <span
                className={`text-[13px] leading-snug ${
                  tile.state === "too-low" || tile.state === "too-high" ? "font-semibold text-chip-critical-fg" : "text-foreground"
                }`}
              >
                {tile.note}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      {line ? <p className="text-sm text-muted">{line}</p> : null}
    </section>
  );
}
