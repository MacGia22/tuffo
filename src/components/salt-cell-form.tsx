"use client";

import { useActionState, useState } from "react";
import { saveSaltCell, type CellState } from "@/app/app/pools/[id]/actions";
import { DEFAULT_SALT_TEXT, MAX_CELL_LEVELS, MIN_CELL_LEVELS, OUTPUT_UNITS, SALT_CELLS, saltTargetText } from "@/lib/salt-cells";
import { InstallDateField } from "@/components/install-date-field";

const initial: CellState = {};
const field = "h-11 rounded-xl border border-border-input bg-surface px-3 text-base text-foreground outline-none focus:border-lagoon focus:ring-2 focus:ring-lagoon/30";

/** The cell as stored on the pool, for the forms. */
export interface CurrentCell {
  model: string | null;
  lbPerDay: number | null;
  /** The pool's own salt range, ppm; null: the listed cell's or the usual one. */
  saltTarget?: { low: number; high: number } | null;
  /** An "Other" cell set in levels 1 to this many; null: percent. */
  levels?: number | null;
}

/**
 * The cell form on its own: model or rated output (and for another cell, percent or
 * levels), the salt level it asks for, and on the settings page an install date.
 * `replace` stores the current cell in the history and starts a new one.
 */
export function CellForm({
  poolId,
  current,
  mode = "set",
  installedOn = null,
  onCancel,
}: {
  poolId: string;
  current: CurrentCell;
  mode?: "set" | "fix" | "replace";
  installedOn?: string | null;
  onCancel?: () => void;
}) {
  const [state, action, pending] = useActionState(saveSaltCell, initial);
  const fresh = mode === "replace";
  const listed = fresh ? undefined : SALT_CELLS.find((c) => c.name === current.model);
  const start = fresh ? "" : (listed?.id ?? (current.lbPerDay ? "other" : ""));
  const [model, setModel] = useState(start);
  const [scale, setScale] = useState<"percent" | "levels">(!fresh && current.levels ? "levels" : "percent");
  const picked = SALT_CELLS.find((c) => c.id === model);
  const usualSalt = picked?.saltPpm ? saltTargetText(picked.saltPpm) : DEFAULT_SALT_TEXT;

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
                {c.name} ({c.gPerHour ? `${c.gPerHour} g/h` : `${c.lbPerDay} lb/day`})
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
        {model === "other" ? (
          <>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Its control is set in
              <select name="cell_scale" value={scale} onChange={(e) => setScale(e.target.value as "percent" | "levels")} className={field}>
                <option value="percent">Percent</option>
                <option value="levels">Levels (1, 2, 3…)</option>
              </select>
            </label>
            {scale === "levels" ? (
              <label className="flex flex-col gap-1 text-xs text-muted">
                Highest level
                <input
                  name="cell_levels"
                  type="number"
                  inputMode="numeric"
                  min={MIN_CELL_LEVELS}
                  max={MAX_CELL_LEVELS}
                  step={1}
                  required
                  defaultValue={!fresh && current.levels ? String(current.levels) : ""}
                  placeholder="8"
                  className={`${field} w-24`}
                />
              </label>
            ) : null}
          </>
        ) : null}
        {mode !== "set" ? (
          <InstallDateField defaultValue={fresh ? "" : (installedOn ?? "")} hint={fresh ? "(empty = today)" : undefined} />
        ) : null}
      </div>
      <p className="text-xs text-muted">
        The rating is on the cell&apos;s label or in its manual, often as pounds per day or grams per hour.
      </p>
      <div className="flex flex-col gap-1">
        <label htmlFor={`salt-target-${mode}`} className="text-xs text-muted">
          Salt level your chlorinator asks for (ppm)
        </label>
        <input
          id={`salt-target-${mode}`}
          name="salt_target"
          inputMode="text"
          aria-describedby={`salt-target-${mode}-hint`}
          defaultValue={!fresh && current.saltTarget ? `${current.saltTarget.low}-${current.saltTarget.high}` : ""}
          placeholder={usualSalt.replace(" ppm", "")}
          className={`${field} w-48`}
        />
        <p id={`salt-target-${mode}-hint`} className="text-xs text-muted">
          On the chlorinator&apos;s label or in its manual. A range, or one number (it becomes ±10%). Empty: {usualSalt}.
        </p>
      </div>
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
  salt = null,
}: {
  poolId: string;
  current: CurrentCell;
  /** The salt range the advice uses (the pool's own or its listed cell's); null: the usual. */
  salt?: { low: number; high: number } | null;
}) {
  const known = current.lbPerDay !== null;
  const form = <CellForm poolId={poolId} current={current} />;

  if (known) {
    return (
      <details className="text-sm">
        <summary className="flex min-h-11 cursor-pointer items-center">
          <span>
          Salt cell: <span className="font-semibold">{current.model && current.model !== "Other" ? current.model : "rated"}</span>,{" "}
          {current.lbPerDay} lb of chlorine a day at 100%, salt {salt ? saltTargetText(salt) : DEFAULT_SALT_TEXT}
          {current.levels ? `, set in levels 1–${current.levels}` : ""} <span className="font-semibold text-lagoon">· Change</span>
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
