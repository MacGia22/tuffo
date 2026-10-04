"use client";

import { useActionState } from "react";
import { readScanReportAgain, type ReadAgainState } from "./actions";

const initial: ReadAgainState = {};

/** "Read again": the current reader on a shared photo, against the first read and the correction. */
export function ReadAgain({ id }: { id: string }) {
  const [state, action, pending] = useActionState(readScanReportAgain, initial);
  return (
    <div className="flex flex-col gap-2">
      <form action={action}>
        <input type="hidden" name="id" value={id} />
        <button
          type="submit"
          disabled={pending}
          className="h-10 rounded-xl border border-border px-3 text-sm font-semibold hover:border-lagoon disabled:opacity-60"
        >
          {pending ? "Reading…" : "Read again"}
        </button>
      </form>
      {state.error ? <p className="text-sm text-red-700 dark:text-red-300">{state.error}</p> : null}
      {state.lines ? (
        <div className="overflow-x-auto">
          <table className="text-sm">
            <caption className="text-left text-xs text-muted">Read again{state.confidence ? `, ${state.confidence} confidence` : ""}; not stored</caption>
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="py-1 pr-3">Field</th>
                <th className="py-1 pr-3">First read</th>
                <th className="py-1 pr-3">Read now</th>
                <th className="py-1">Corrected</th>
              </tr>
            </thead>
            <tbody>
              {state.lines.map((l) => (
                <tr key={l.label} className="border-t border-border">
                  <td className="py-1 pr-3">{l.label}</td>
                  <td className="py-1 pr-3">{l.before}</td>
                  <td className="py-1 pr-3 font-semibold">
                    {l.again}
                    {l.again === l.corrected ? <span className="font-normal text-muted"> (matches)</span> : null}
                  </td>
                  <td className="py-1">{l.corrected}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
