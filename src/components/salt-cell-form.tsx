"use client";

import { useActionState, useState } from "react";
import { saveSaltCell, type CellState } from "@/app/app/pools/[id]/actions";
import { OUTPUT_UNITS, SALT_CELLS } from "@/lib/salt-cells";

const initial: CellState = {};
const field = "h-10 rounded-xl border border-border bg-background px-3 text-sm";

/**
 * A salt pool's cell. With its rated output, the plan can suggest the cell setting in
 * percent and the model can count what the cell made between tests.
 */
export function SaltCellForm({
  poolId,
  current,
}: {
  poolId: string;
  current: { model: string | null; lbPerDay: number | null };
}) {
  const [state, action, pending] = useActionState(saveSaltCell, initial);
  const listed = SALT_CELLS.find((c) => c.name === current.model);
  const [model, setModel] = useState(listed?.id ?? (current.lbPerDay ? "other" : ""));
  const known = current.lbPerDay !== null;

  const form = (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="pool_id" value={poolId} />
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Cell
          <select name="model" value={model} onChange={(e) => setModel(e.target.value)} className={field}>
            <option value="" disabled>
              Choose…
            </option>
            {SALT_CELLS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.lbPerDay} lb/day)
              </option>
            ))}
            <option value="other">Another cell: enter its rated output</option>
          </select>
        </label>
        {model === "other" ? (
          <>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Rated output at 100%
              <input
                name="value"
                inputMode="decimal"
                defaultValue={!listed && current.lbPerDay ? String(current.lbPerDay) : ""}
                placeholder="1.4"
                className={`${field} w-28`}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Unit
              <select name="unit" defaultValue="lb_day" className={field}>
                {OUTPUT_UNITS.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}
        <button
          type="submit"
          disabled={pending || model === ""}
          className="h-10 rounded-xl bg-lagoon px-4 text-sm font-semibold text-white hover:bg-lagoon-deep disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button
          type="reset"
          onClick={() => setModel(listed?.id ?? (current.lbPerDay ? "other" : ""))}
          className="h-10 px-2 text-sm text-muted underline-offset-2 hover:underline"
        >
          Cancel
        </button>
      </div>
      <p className="text-xs text-muted">
        The rating is on the cell&apos;s label or in its manual, often as pounds per day or grams per hour.
      </p>
      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      {state.saved ? (
        <p role="status" className="text-sm text-muted">
          Saved. The plan and the advice will suggest a cell setting after the next refresh (a few seconds).
        </p>
      ) : null}
    </form>
  );

  if (known) {
    return (
      <details id="salt-cell" className="rounded-2xl border border-border bg-surface p-4 text-sm">
        <summary className="cursor-pointer">
          Salt cell: <span className="font-semibold">{current.model && current.model !== "Other" ? current.model : "rated"}</span>,{" "}
          {current.lbPerDay} lb of chlorine a day at 100% <span className="text-lagoon">· Change</span>
        </summary>
        <div className="mt-3">{form}</div>
      </details>
    );
  }
  return (
    <section id="salt-cell" aria-labelledby="salt-cell-title" className="flex flex-col gap-2 rounded-2xl border border-sun/60 bg-sun/10 p-4">
      <h2 id="salt-cell-title" className="text-lg font-semibold">
        Which salt cell do you have?
      </h2>
      <p className="text-sm">
        With its rated output, Tuffo can suggest the cell setting in percent for the week&apos;s weather and learn how
        much chlorine your pool uses.
      </p>
      {form}
    </section>
  );
}
