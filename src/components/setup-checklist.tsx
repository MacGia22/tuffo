"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import type { SetupStep } from "@/lib/setup";

const EVENT = "tuffo-setup-dismissed";

function key(poolId: string) {
  return `tuffo.setup-dismissed.${poolId}`;
}

function read(poolId: string): boolean {
  try {
    return localStorage.getItem(key(poolId)) === "1";
  } catch {
    return false;
  }
}

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(EVENT, callback);
  };
}

/**
 * "2 of 7 set up · Finish setup": one row under the test card; tapping it opens the steps
 * that make the advice, plan and reminders work, each linking to where it is done. Gone
 * once everything is done, or when dismissed (remembered on this device).
 */
export function SetupChecklist({ poolId, steps }: { poolId: string; steps: SetupStep[] }) {
  const dismissed = useSyncExternalStore(
    subscribe,
    () => read(poolId),
    () => false,
  );
  const done = steps.filter((s) => s.done).length;
  if (dismissed || done === steps.length) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(key(poolId), "1");
    } catch {
      // Private mode: it hides until the next visit.
    }
    window.dispatchEvent(new Event(EVENT));
  };

  const next = steps.find((s) => !s.done);
  return (
    <details className="group rounded-2xl border border-lagoon/40 bg-lagoon/5 px-4">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 py-1 text-sm [&::-webkit-details-marker]:hidden">
        <span>
          <span className="font-semibold">
            {done} of {steps.length} set up
          </span>
          {next ? <span className="text-muted"> · next: {next.label.toLowerCase()}</span> : null}
        </span>
        <span className="shrink-0 font-semibold text-lagoon">
          <span className="group-open:hidden">Finish setup</span>
          <span className="hidden group-open:inline">Hide</span>
        </span>
      </summary>
      <div className="flex flex-col gap-3 pb-4">
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={steps.length}
          aria-valuenow={done}
          aria-label="Set-up steps done"
          className="h-1.5 w-full overflow-hidden rounded-full bg-chart-grid"
        >
          <div className="h-full rounded-full bg-lagoon" style={{ width: `${(done / steps.length) * 100}%` }} />
        </div>
        <ul className="grid gap-1 sm:grid-cols-2">
          {steps.map((s) => (
            <li key={s.key}>
              {s.done ? (
                <span className="flex min-h-11 items-center gap-2 text-sm text-muted line-through decoration-muted/50">
                  <span aria-hidden="true" className="text-status-good">
                    ✓
                  </span>
                  <span>
                    {s.label}
                    <span className="sr-only"> (done)</span>
                  </span>
                </span>
              ) : (
                <Link href={s.href} className="flex min-h-11 items-center gap-2 text-sm font-semibold text-lagoon hover:underline">
                  <span aria-hidden="true" className="inline-block h-3.5 w-3.5 rounded-full border-2 border-lagoon" />
                  {s.label}
                </Link>
              )}
            </li>
          ))}
        </ul>
        <button type="button" onClick={dismiss} className="min-h-11 self-start text-sm text-muted underline-offset-2 hover:underline">
          Dismiss
        </button>
      </div>
    </details>
  );
}
