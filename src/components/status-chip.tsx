import type { TileState } from "@/lib/tiles";

/** Chip colours by state; every chip also carries an icon and a word, never colour alone. */
const TONE: Record<TileState, string> = {
  ok: "bg-chip-ok-bg text-chip-ok-fg",
  high: "bg-chip-warn-bg text-chip-warn-fg",
  low: "bg-chip-warn-bg text-chip-warn-fg",
  "too-low": "bg-chip-critical-bg text-chip-critical-fg",
  "too-high": "bg-chip-critical-bg text-chip-critical-fg",
  none: "bg-chip-none-bg text-chip-none-fg",
  old: "bg-chip-none-bg text-chip-none-fg",
};

const PATH: Record<TileState, string> = {
  // check
  ok: "m5 12 5 5 9-10",
  // arrow up, arrow down
  high: "M12 19V5M6 11l6-6 6 6",
  low: "M12 5v14M6 13l6 6 6-6",
  // alert: triangle with a mark
  "too-low": "M12 4 2.5 20h19L12 4zM12 10v4.5M12 17.5v.01",
  "too-high": "M12 4 2.5 20h19L12 4zM12 10v4.5M12 17.5v.01",
  // a dash in a circle
  none: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8 12h8",
  // clock
  old: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2",
};

export function StatusChip({ state, text }: { state: TileState; text: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 self-start whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${TONE[state]}`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-3.5 w-3.5 shrink-0"
        aria-hidden="true"
      >
        <path d={PATH[state]} />
      </svg>
      {text}
    </span>
  );
}
