"use client";

import { useActionState, useState, useTransition } from "react";
import { ResetButton } from "@/components/form-cancel";
import { INTERVAL_UNITS, splitInterval } from "@/lib/maintenance";
import { pressureUnitLabel, type Units } from "@/lib/format";
import {
  deleteMaintenance,
  deletePressure,
  logMaintenance,
  logPressure,
  saveCellInstalled,
  saveInterval,
  type MaintenanceState,
} from "./actions";

const initial: MaintenanceState = {};
const field = "h-10 rounded-xl border border-border bg-background px-3 text-sm";
const label = "flex flex-col gap-1 text-xs text-muted";
const primary =
  "h-10 rounded-xl bg-lagoon px-4 text-sm font-semibold text-white hover:bg-lagoon-deep disabled:opacity-60";

function Status({
  state,
  saved = "Saved.",
  poolId,
  undo,
}: {
  state: MaintenanceState;
  saved?: string;
  poolId?: string;
  /** Removes the row just added. */
  undo?: (formData: FormData) => Promise<void>;
}) {
  const [pending, start] = useTransition();
  const [undone, setUndone] = useState<string | null>(null);
  // A new save has a new id, so it shows its own Undo again.
  if (state.error) {
    return (
      <p role="alert" className="text-sm text-red-600">
        {state.error}
      </p>
    );
  }
  if (!state.saved) return null;
  if (undone && undone === state.undoId) {
    return (
      <p role="status" className="text-sm text-muted">
        Removed.
      </p>
    );
  }
  const canUndo = Boolean(undo && poolId && state.undoId);
  return (
    <p role="status" className="flex items-center gap-2 text-sm text-muted">
      {saved.replace(/\.$/, "")}
      {canUndo ? (
        <>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const data = new FormData();
                data.set("pool_id", poolId as string);
                data.set("id", state.undoId as string);
                await (undo as (f: FormData) => Promise<void>)(data);
                setUndone(state.undoId ?? null);
              })
            }
            className="font-semibold text-lagoon underline-offset-2 hover:underline disabled:opacity-60"
          >
            {pending ? "Undoing…" : "Undo"}
          </button>
        </>
      ) : null}
    </p>
  );
}

/**
 * "Done" for a task: today with one click, or another day when `withDate` (the
 * maintenance page, for logging what was done before).
 */
export function DoneForm({
  poolId,
  task,
  taskLabel,
  withDate = false,
}: {
  poolId: string;
  task: string;
  taskLabel: string;
  withDate?: boolean;
}) {
  const [state, action, pending] = useActionState(logMaintenance, initial);
  const [otherDay, setOtherDay] = useState(false);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="pool_id" value={poolId} />
      <input type="hidden" name="task" value={task} />
      {withDate && otherDay ? (
        <label className={label}>
          Done on
          <input type="date" name="done_on" required className={`${field} w-44`} />
        </label>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        aria-label={`${taskLabel}: done${withDate && otherDay ? "" : " today"}`}
        className="h-9 rounded-xl border border-border bg-surface px-3 text-sm font-semibold hover:border-lagoon disabled:opacity-60"
      >
        {pending ? "Saving…" : withDate && otherDay ? "Save" : "Done today"}
      </button>
      {withDate && !otherDay ? (
        <button
          type="button"
          onClick={() => setOtherDay(true)}
          className="h-9 text-sm text-lagoon underline-offset-2 hover:underline"
        >
          Another day
        </button>
      ) : null}
      {withDate && otherDay ? (
        <button
          type="button"
          onClick={() => setOtherDay(false)}
          className="h-9 text-sm text-muted underline-offset-2 hover:underline"
        >
          Cancel
        </button>
      ) : null}
      <Status state={state} saved="Logged." poolId={poolId} undo={deleteMaintenance} />
    </form>
  );
}

export function PressureForm({ poolId, units }: { poolId: string; units: Units }) {
  const [state, action, pending] = useActionState(logPressure, initial);
  const [otherDay, setOtherDay] = useState(false);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="pool_id" value={poolId} />
      <input type="hidden" name="units" value={units} />
      <div className="flex flex-wrap items-end gap-3">
        <label className={label}>
          Gauge ({pressureUnitLabel(units)})
          <input name="pressure" required inputMode="decimal" className={`${field} w-28`} />
        </label>
        {otherDay ? (
          <label className={label}>
            Day
            <input type="date" name="read_on" autoFocus className={`${field} w-44`} />
          </label>
        ) : (
          <p className="flex h-10 items-center gap-2 text-sm">
            <span className="text-muted">Day:</span> Today
            <span aria-hidden="true" className="text-muted">
              ·
            </span>
            <button
              type="button"
              onClick={() => setOtherDay(true)}
              aria-label="Change the day"
              className="font-semibold text-lagoon underline-offset-2 hover:underline"
            >
              Change
            </button>
          </p>
        )}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="clean" className="h-4 w-4 accent-lagoon" />
        Just cleaned or backwashed
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={primary}>
          {pending ? "Saving…" : "Log pressure"}
        </button>
        <ResetButton
          onClick={() => setOtherDay(false)}
          className="h-10 text-sm text-muted underline-offset-2 hover:underline"
        />
      </div>
      <details className="text-xs text-muted">
        <summary className="cursor-pointer list-none">
          Read it with the pump at its usual speed.{" "}
          <span aria-hidden="true" className="text-lagoon">
            ⓘ
          </span>
          <span className="sr-only">More about reading the gauge</span>
        </summary>
        <p className="mt-1 max-w-md">
          The same speed each time keeps readings comparable. Tick Just cleaned for the reading right after you clean
          or backwash: Tuffo counts the rise from that clean pressure.
        </p>
      </details>
      <Status state={state} poolId={poolId} undo={deletePressure} />
    </form>
  );
}

export function IntervalForm({
  poolId,
  task,
  days,
  defaultDays,
}: {
  poolId: string;
  task: string;
  days: number;
  defaultDays: number;
}) {
  const [state, action, pending] = useActionState(saveInterval, initial);
  const current = splitInterval(days);
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-lagoon">Change how often</summary>
      <form action={action} className="mt-2 flex flex-wrap items-end gap-2">
        <input type="hidden" name="pool_id" value={poolId} />
        <input type="hidden" name="task" value={task} />
        <label className={label}>
          Every
          <input
            name="count"
            inputMode="numeric"
            defaultValue={String(current.count)}
            className={`${field} w-20`}
          />
        </label>
        <label className={label}>
          <span className="sr-only">Unit</span>
          <select name="unit" defaultValue={current.unit} className={field}>
            {INTERVAL_UNITS.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={pending} className={primary}>
          Save
        </button>
        <button
          type="reset"
          onClick={(e) => e.currentTarget.closest("details")?.removeAttribute("open")}
          className="h-10 text-sm text-muted underline-offset-2 hover:underline"
        >
          Cancel
        </button>
        {days !== defaultDays ? (
          <button
            type="submit"
            name="reset"
            value="1"
            disabled={pending}
            className="h-10 text-sm text-muted underline-offset-2 hover:underline"
          >
            Back to the default
          </button>
        ) : null}
        <Status state={state} />
      </form>
    </details>
  );
}

export function CellInstalledForm({ poolId, installedOn }: { poolId: string; installedOn: string | null }) {
  const [state, action, pending] = useActionState(saveCellInstalled, initial);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="pool_id" value={poolId} />
      <label className={label}>
        Cell installed on
        <input type="date" name="installed_on" defaultValue={installedOn ?? ""} className={`${field} w-44`} />
      </label>
      <button type="submit" disabled={pending} className={primary}>
        {pending ? "Saving…" : "Save"}
      </button>
      <ResetButton className="h-10 text-sm text-muted underline-offset-2 hover:underline" />
      <Status state={state} />
    </form>
  );
}

/** A task never logged: the day it was last done, so the reminders can start. */
export function StartDateForm({ poolId, task, taskLabel, today }: { poolId: string; task: string; taskLabel: string; today: string }) {
  const [state, action, pending] = useActionState(logMaintenance, initial);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="pool_id" value={poolId} />
      <input type="hidden" name="task" value={task} />
      <label className={label}>
        Last done
        <input type="date" name="done_on" required max={today} defaultValue={today} className={`${field} w-44`} aria-label={`${taskLabel}: last done`} />
      </label>
      <button type="submit" disabled={pending} className={primary}>
        {pending ? "Saving…" : "Set"}
      </button>
      <Status state={state} saved="Saved." poolId={poolId} undo={deleteMaintenance} />
    </form>
  );
}
