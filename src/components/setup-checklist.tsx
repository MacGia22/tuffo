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
 * "Set up N of 7": what makes the advice, plan and reminders work, each linking to where
 * it is done. Gone once everything is done, or when dismissed (remembered on this device).
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

  return (
    <section aria-labelledby="setup" className="flex flex-col gap-3 rounded-2xl border border-lagoon/40 bg-lagoon/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="setup" className="text-base font-semibold">
          Set up {done} of {steps.length}
        </h2>
        <button type="button" onClick={dismiss} className="text-sm text-muted underline-offset-2 hover:underline">
          Dismiss
        </button>
      </div>
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
              <span className="flex items-center gap-2 py-1 text-sm text-muted line-through decoration-muted/50">
                <span aria-hidden="true" className="text-status-good">
                  ✓
                </span>
                <span>
                  {s.label}
                  <span className="sr-only"> (done)</span>
                </span>
              </span>
            ) : (
              <Link href={s.href} className="flex items-center gap-2 py-1 text-sm font-semibold text-lagoon hover:underline">
                <span aria-hidden="true" className="inline-block h-3.5 w-3.5 rounded-full border-2 border-lagoon" />
                {s.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
