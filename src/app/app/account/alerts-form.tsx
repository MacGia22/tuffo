"use client";

import { useActionState } from "react";
import { ResetButton } from "@/components/form-cancel";
import { saveAlertSettings, type AlertState } from "./actions";

const initial: AlertState = {};

export interface AlertChoices {
  algae: boolean;
  test_reminder: boolean;
  test_after_days: number;
  weekly: boolean;
  maintenance: boolean;
}

/** One pool's alert choices. All off until the person switches one on. */
export function AlertsForm({ poolId, poolName, choices }: { poolId: string; poolName: string; choices: AlertChoices }) {
  const [state, action, pending] = useActionState(saveAlertSettings, initial);
  const id = (name: string) => `${name}-${poolId}`;
  return (
    <form action={action} className="flex flex-col gap-2 rounded-xl border border-border p-4">
      <input type="hidden" name="pool_id" value={poolId} />
      <p className="font-semibold">{poolName}</p>
      <label htmlFor={id("algae")} className="flex items-start gap-2 text-sm">
        <input id={id("algae")} type="checkbox" name="algae" defaultChecked={choices.algae} className="mt-1 accent-lagoon" />
        <span>
          Algae-risk warning <span className="text-muted">— when the plan expects free chlorine to fall below the minimum today or tomorrow</span>
        </span>
      </label>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label htmlFor={id("test_reminder")} className="flex items-center gap-2">
          <input id={id("test_reminder")} type="checkbox" name="test_reminder" defaultChecked={choices.test_reminder} className="accent-lagoon" />
          Time to test, after
        </label>
        <label htmlFor={id("test_after_days")} className="sr-only">
          Days without a test
        </label>
        <select
          id={id("test_after_days")}
          name="test_after_days"
          defaultValue={String(choices.test_after_days)}
          className="h-9 rounded-lg border border-border bg-surface px-2"
        >
          {[2, 3, 4, 5, 7, 10, 14].map((d) => (
            <option key={d} value={d}>
              {d} days
            </option>
          ))}
        </select>
        <span className="text-muted">without a test</span>
      </div>
      <label htmlFor={id("weekly")} className="flex items-start gap-2 text-sm">
        <input id={id("weekly")} type="checkbox" name="weekly" defaultChecked={choices.weekly} className="mt-1 accent-lagoon" />
        <span>
          Weekly summary <span className="text-muted">— Saturday morning: the week&apos;s plan</span>
        </span>
      </label>
      <label htmlFor={id("maintenance")} className="flex items-start gap-2 text-sm">
        <input id={id("maintenance")} type="checkbox" name="maintenance" defaultChecked={choices.maintenance} className="mt-1 accent-lagoon" />
        <span>
          Maintenance reminders <span className="text-muted">— when cleaning the cell or filter, or other upkeep, is due (at most once a week)</span>
        </span>
      </label>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:border-lagoon disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <ResetButton />
        {state.message ? <span className="text-sm text-muted">{state.message}</span> : null}
        {state.error ? <span className="text-sm text-red-600">{state.error}</span> : null}
      </div>
    </form>
  );
}
