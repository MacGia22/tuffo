"use client";

import { useActionState, useState } from "react";
import { saveSaltCell, type CellState } from "@/app/app/pools/[id]/actions";
import { OUTPUT_UNITS, SALT_CELLS } from "@/lib/salt-cells";
import { InstallDateField } from "@/components/install-date-field";

const initial: CellState = {};
const field = "h-11 rounded-xl border border-border-input bg-surface px-3 text-base text-foreground outline-none focus:border-lagoon focus:ring-2 focus:ring-lagoon/30";

/**
 * The cell form on its own: model or rated output, and on the settings page an install
 * date. `replace` stores the current cell in the history and starts a new one.
 */
export function CellForm({
  poolId,
  current,
  mode = "set",
  installedOn = null,
  onCancel,
}: {
  poolId: string;
  current: { model: string | null; lbPerDay: number | null };
  mode?: "set" | "fix" | "replace";
  installedOn?: string | null;
  onCancel?: () => void;
}) {
  const [state, action, pending] = useActionState(saveSaltCell, initial);
  const fresh = mode === "replace";
  const listed = fresh ? undefined : SALT_CELLS.find((c) => c.name === current.model);
  const start = fresh ? "" : (listed?.id ?? (current.lbPerDay ? "other" : ""));
  const [model, setModel] = useState(start);

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="pool_id" value={poolId} />
      {fresh ? <input type="hidden" name="replaced" value="on" /> : null}
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-0 flex-col gap-1 text-xs text-muted">
          Cell
          <select name="model" value={model} onChange={(e) => setModel(e.target.value)} className={`${field} max-w-full`}>
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
                defaultValue={!fresh && !listed && current.lbPerDay ? String(current.lbPerDay) : ""}
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
        {mode !== "set" ? (
          <InstallDateField defaultValue={fresh ? "" : (installedOn ?? "")} hint={fresh ? "(empty = today)" : undefined} />
        ) : null}
      </div>
      <p className="text-xs text-muted">
        The rating is on the cell&apos;s label or in its manual, often as pounds per day or grams per hour.
      </p>
      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={pending || model === ""}
          className="h-11 rounded-xl bg-action px-4 text-sm font-semibold text-white hover:bg-action-deep disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button
          type="reset"
          onClick={() => {
            setModel(start);
            onCancel?.();
          }}
          className="h-10 px-2 text-sm text-muted underline-offset-2 hover:underline"
        >
          Cancel
        </button>
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-300">
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
}

/**
 * The cell's model and rating inside the pool page's "Salt cell" section (which holds the
 * section's id). With its rated output, the plan can suggest the cell setting in percent
 * and the model can count what the cell made between tests.
 */
export function SaltCellForm({
  poolId,
  current,
}: {
  poolId: string;
  current: { model: string | null; lbPerDay: number | null };
}) {
  const known = current.lbPerDay !== null;
  const form = <CellForm poolId={poolId} current={current} />;

  if (known) {
    return (
      <details className="text-sm">
        <summary className="flex min-h-11 cursor-pointer items-center">
          <span>
          Salt cell: <span className="font-semibold">{current.model && current.model !== "Other" ? current.model : "rated"}</span>,{" "}
          {current.lbPerDay} lb of chlorine a day at 100% <span className="font-semibold text-lagoon">· Change</span>
          </span>
        </summary>
        <div className="mt-3">{form}</div>
      </details>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-chip-warn-fg/40 bg-chip-warn-bg p-3 text-chip-warn-fg">
      <h3 className="text-base font-semibold">Which salt cell do you have?</h3>
      <p className="text-sm">
        With its rated output, Tuffo can suggest the cell setting in percent for the week&apos;s weather and learn how
        much chlorine your pool uses.
      </p>
      {form}
    </div>
  );
}
