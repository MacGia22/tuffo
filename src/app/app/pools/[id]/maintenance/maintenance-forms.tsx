"use client";

import { useActionState, useState } from "react";
import { INTERVAL_UNITS, splitInterval } from "@/lib/maintenance";
import { pressureUnitLabel, type Units } from "@/lib/format";
import {
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

function Status({ state, saved = "Saved." }: { state: MaintenanceState; saved?: string }) {
  if (state.error) {
    return (
      <p role="alert" className="text-sm text-red-600">
        {state.error}
      </p>
    );
  }
  return state.saved ? (
    <p role="status" className="text-sm text-muted">
      {saved}
    </p>
  ) : null;
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
      <Status state={state} saved="Logged." />
    </form>
  );
}

export function PressureForm({ poolId, units }: { poolId: string; units: Units }) {
  const [state, action, pending] = useActionState(logPressure, initial);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="pool_id" value={poolId} />
      <input type="hidden" name="units" value={units} />
      <div className="flex flex-wrap items-end gap-3">
        <label className={label}>
          Gauge ({pressureUnitLabel(units)})
          <input
            name="pressure"
            required
            inputMode="decimal"
            placeholder={units === "us" ? "14" : "1.0"}
            className={`${field} w-28`}
          />
        </label>
        <label className={label}>
          Day (empty: today)
          <input type="date" name="read_on" className={`${field} w-44`} />
        </label>
        <button type="submit" disabled={pending} className={primary}>
          {pending ? "Saving…" : "Log pressure"}
        </button>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="clean" className="h-4 w-4 accent-lagoon" />
        Just cleaned or backwashed: this is the clean pressure
      </label>
      <p className="text-xs text-muted">
        Read it with the pump running at its usual speed; the same speed each time keeps readings comparable.
      </p>
      <Status state={state} />
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
      <Status state={state} />
    </form>
  );
}
