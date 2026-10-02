import Link from "next/link";
import type { HistoryCell } from "@/lib/tiles";

export interface HistoryRow {
  id: string;
  when: string;
  cells: HistoryCell[];
  /** "82 °F"; null when not taken. */
  temp: string | null;
}

const MARK = {
  ok: { glyph: "✓", word: "in range", className: "text-status-good" },
  low: { glyph: "↓", word: "low", className: "text-foreground" },
  high: { glyph: "↑", word: "high", className: "text-foreground" },
} as const;

/** In or out of the pool's range: a mark plus the word, never colour alone. */
function Mark({ level }: { level: HistoryCell["level"] }) {
  if (!level) return null;
  const m = MARK[level];
  return level === "ok" ? (
    <span className={`text-xs ${m.className}`}>
      <span aria-hidden="true">{m.glyph}</span>
      <span className="sr-only"> {m.word}</span>
    </span>
  ) : (
    <span className="rounded-full bg-chip-warn-bg px-1.5 text-xs font-semibold leading-5 text-chip-warn-fg">
      <span aria-hidden="true">{m.glyph} </span>
      {m.word}
    </span>
  );
}

/**
 * Past tests. Phones get one card per test (date, each value with its range mark, Edit);
 * wider screens keep the table. Remove is on the edit screen.
 */
export function TestHistory({ poolId, rows, back }: { poolId: string; rows: HistoryRow[]; back: string }) {
  const edit = (id: string) => `/app/pools/${poolId}/readings/${id}/edit?${back}`;
  return (
    <section aria-labelledby="history" className="flex flex-col gap-3">
      <h2 id="history" className="text-xl font-semibold">
        Test history
      </h2>

      <ul className="flex flex-col gap-3 md:hidden">
        {rows.map((r) => {
          const tested = r.cells.filter((c) => c.text !== "—");
          return (
            <li key={r.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
              <p className="text-sm font-semibold">{r.when}</p>
              <dl className="grid grid-cols-3 gap-x-3 gap-y-2">
                {tested.map((c) => (
                  <div key={c.key} className="flex flex-col">
                    <dt className="text-xs text-muted">{c.label}</dt>
                    <dd className="flex flex-wrap items-center gap-1 text-base tabular-nums">
                      {c.text}
                      <Mark level={c.level} />
                    </dd>
                  </div>
                ))}
                {r.temp ? (
                  <div className="flex flex-col">
                    <dt className="text-xs text-muted">Temp</dt>
                    <dd className="text-base tabular-nums">{r.temp}</dd>
                  </div>
                ) : null}
              </dl>
              <Link
                href={edit(r.id)}
                aria-label={`Edit the test from ${r.when}`}
                className="self-start rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:border-lagoon"
              >
                Edit
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="hidden overflow-x-auto rounded-2xl border border-border md:block">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-xs font-semibold text-muted">
            <tr>
              <th className="px-4 py-3">When</th>
              {rows[0]?.cells.map((c) => (
                <th key={c.key} className="px-3 py-3 text-right">
                  {c.label}
                </th>
              ))}
              <th className="px-3 py-3 text-right">Temp</th>
              <th className="px-3 py-3">
                <span className="sr-only">Edit</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="whitespace-nowrap px-4 py-2.5">{r.when}</td>
                {r.cells.map((c) => (
                  <td key={c.key} className="px-3 py-2.5 text-right tabular-nums">
                    <span className="inline-flex items-center justify-end gap-1">
                      {c.text}
                      {c.level && c.level !== "ok" ? <Mark level={c.level} /> : null}
                    </span>
                  </td>
                ))}
                <td className="px-3 py-2.5 text-right tabular-nums">{r.temp ?? "—"}</td>
                <td className="px-2 py-1.5 text-right">
                  <Link
                    href={edit(r.id)}
                    aria-label={`Edit the test from ${r.when}`}
                    className="rounded-lg border border-border px-3 py-1.5 font-semibold hover:border-lagoon"
                  >
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
