"use client";

import { useState, useTransition } from "react";
import { removeEntry, restoreEntry } from "@/app/app/remove-actions";
import type { Units } from "@/lib/format";
import { editMaintenance, editPressure } from "./actions";

export interface LogItem {
  id: string;
  /** "Sep 30: Empty the pump basket", "Sep 28: 14 psi (clean)" */
  text: string;
  /** YYYY-MM-DD */
  date: string;
  /** Pressure readings only: the gauge value as shown, and whether it was the clean one. */
  pressure?: { value: string; clean: boolean };
}

const field = "h-11 rounded-xl border border-border-input bg-surface px-3 text-base text-foreground outline-none focus:border-lagoon focus:ring-2 focus:ring-lagoon/30";
const label = "flex flex-col gap-1 text-xs text-muted";

/**
 * "Done lately" and the recent pressure readings. A row opens its editor (day, and for
 * pressure the value and the clean flag) with Remove; a removal shows Undo here.
 */
export function LogList({
  poolId,
  kind,
  items,
  units,
  today,
}: {
  poolId: string;
  kind: "maintenance" | "pressure";
  items: LogItem[];
  units: Units;
  today: string;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [removed, setRemoved] = useState<{ text: string; row: Record<string, unknown> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const remove = (item: LogItem) =>
    start(async () => {
      setError(null);
      const result = await removeEntry(kind, item.id);
      if (!result.ok) {
        setError("Could not remove it. It may already be gone.");
        return;
      }
      setOpen(null);
      setRemoved({ text: item.text, row: result.row });
    });

  const undo = () =>
    start(async () => {
      if (!removed) return;
      const ok = await restoreEntry(kind, removed.row);
      setRemoved(null);
      if (!ok) setError("Could not undo. Log it again if you need it.");
    });

  const save = (item: LogItem, form: FormData) =>
    start(async () => {
      setError(null);
      const date = String(form.get("date") ?? "");
      const result =
        kind === "maintenance"
          ? await editMaintenance(poolId, item.id, date)
          : await editPressure(poolId, item.id, {
              readOn: date,
              pressure: String(form.get("pressure") ?? ""),
              clean: form.get("clean") === "on",
              units,
            });
      if (result.error) setError(result.error);
      else setOpen(null);
    });

  return (
    <div className="flex flex-col gap-2">
      {removed ? (
        <p role="status" className="flex flex-wrap items-center gap-2 rounded-xl bg-navy px-3 py-2 text-sm text-white">
          Removed: {removed.text}
          <span aria-hidden="true">·</span>
          <button type="button" onClick={undo} disabled={pending} className="font-semibold text-ice underline-offset-2 hover:underline">
            {pending ? "Undoing…" : "Undo"}
          </button>
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface text-sm">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              aria-expanded={open === item.id}
              onClick={() => setOpen(open === item.id ? null : item.id)}
              className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-lagoon/5"
            >
              <span>{item.text}</span>
              <span aria-hidden="true" className={`text-muted transition ${open === item.id ? "rotate-90" : ""}`}>
                ›
              </span>
              <span className="sr-only">{open === item.id ? "Close" : "Edit or remove"}</span>
            </button>
            {open === item.id ? (
              <form action={(form) => save(item, form)} className="flex flex-col gap-3 border-t border-border bg-background/60 px-3 py-3">
                <div className="flex flex-wrap items-end gap-3">
                  <label className={label}>
                    Day
                    <input type="date" name="date" required max={today} defaultValue={item.date} className={`${field} w-44`} />
                  </label>
                  {item.pressure ? (
                    <label className={label}>
                      Gauge ({units === "us" ? "psi" : "bar"})
                      <input name="pressure" required inputMode="decimal" defaultValue={item.pressure.value} className={`${field} w-28`} />
                    </label>
                  ) : null}
                </div>
                {item.pressure ? (
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="clean" defaultChecked={item.pressure.clean} className="h-4 w-4 accent-lagoon" />
                    Just cleaned or backwashed
                  </label>
                ) : null}
                <div className="flex flex-wrap items-center gap-4">
                  <button
                    type="submit"
                    disabled={pending}
                    className="h-11 rounded-xl bg-action px-4 text-sm font-semibold text-white hover:bg-action-deep disabled:opacity-60"
                  >
                    {pending ? "Saving…" : "Save"}
                  </button>
                  <button type="button" onClick={() => setOpen(null)} className="text-sm text-muted underline-offset-2 hover:underline">
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(item)}
                    disabled={pending}
                    className="ml-auto text-sm font-semibold text-red-700 underline-offset-2 hover:underline disabled:opacity-60 dark:text-red-300"
                  >
                    Remove
                  </button>
                </div>
              </form>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
