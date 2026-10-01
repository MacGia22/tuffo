import Link from "next/link";
import { LEVEL_LABEL, type Level, type Tile } from "@/lib/tiles";

const PILL: Record<Level, string> = {
  low: "bg-sun/20 text-foreground",
  ok: "bg-lagoon/10 text-lagoon-deep dark:text-ice",
  high: "bg-sun/20 text-foreground",
};

function LevelIcon({ level }: { level: Level }) {
  const path = level === "ok" ? "m5 12 5 5 9-10" : level === "low" ? "M12 5v14M6 13l6 6 6-6" : "M12 19V5M6 11l6-6 6 6";
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

function shown(tile: Tile): string {
  if (tile.value === null) return "—";
  if (tile.key === "ph") return tile.value.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 2 });
  if (tile.key === "fc" || tile.key === "cc") return tile.value.toFixed(1);
  return Math.round(tile.value).toLocaleString("en-US");
}

/**
 * The latest test, one tile per measure: the value, low / OK / high against the pool's
 * target (icon and word, never colour alone) and the target itself.
 */
export function StatusTiles({
  tiles,
  extra,
  age,
  testedAt,
  method,
  logHref,
}: {
  tiles: Tile[];
  /** Tiles without a target, such as water temperature: [label, value]. */
  extra: [string, string][];
  age: { text: string; days: number; stale: boolean };
  testedAt: string;
  method: string;
  logHref: string;
}) {
  return (
    <section id="today" aria-labelledby="latest" className="flex flex-col gap-3">
      <h2 id="latest" className="sr-only">
        Latest test
      </h2>
      {age.stale ? (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sun/70 bg-sun/10 p-4 text-sm">
          <p>
            <span className="font-semibold">Tested {age.text}.</span> The advice and the plan start from that test; a fresh
            one keeps them on track.
          </p>
          <Link href={logHref} className="rounded-xl bg-lagoon px-4 py-2 font-semibold text-white hover:bg-lagoon-deep">
            Log a test
          </Link>
        </div>
      ) : null}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {tiles.map((tile) => (
          <li
            key={tile.key}
            className={`flex flex-col gap-1 rounded-2xl border bg-surface p-4 ${
              tile.level && tile.level !== "ok" ? "border-sun/70" : "border-border"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              {/* Sentence case, never uppercased: "pH" must stay "pH". */}
              <span className="text-xs font-semibold text-muted">{tile.label}</span>
              {tile.level ? (
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${PILL[tile.level]}`}>
                  <LevelIcon level={tile.level} />
                  {LEVEL_LABEL[tile.level]}
                </span>
              ) : null}
            </div>
            <div className="text-2xl font-semibold">
              {shown(tile)} {tile.unit && tile.value !== null ? <span className="text-sm font-normal text-muted">{tile.unit}</span> : null}
            </div>
            {tile.range ? <div className="text-xs text-muted">Target {tile.range}</div> : null}
          </li>
        ))}
        {extra.map(([label, value]) => (
          <li key={label} className="flex flex-col gap-1 rounded-2xl border border-border bg-surface p-4">
            <span className="text-xs font-semibold text-muted">{label}</span>
            <div className="text-2xl font-semibold">{value}</div>
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted">
        {age.stale ? null : <>Tested {age.text} · </>}
        {testedAt} · {method}
      </p>
    </section>
  );
}
