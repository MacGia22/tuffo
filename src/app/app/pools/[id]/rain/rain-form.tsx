"use client";

import { useActionState } from "react";
import type { Units } from "@/lib/format";
import { clearRain, saveRain, type RainState } from "../actions";

const initial: RainState = {};

const input =
  "h-11 w-40 rounded-xl border border-border bg-surface px-3 text-base text-foreground outline-none placeholder:text-muted/70 focus:border-lagoon focus:ring-2 focus:ring-lagoon/30";

export function RainForm({
  poolId,
  date,
  units,
  current,
}: {
  poolId: string;
  date: string;
  units: Units;
  /** The rain already set for this day, in the person's units; null when none. */
  current: string | null;
}) {
  const [state, action, pending] = useActionState(saveRain, initial);
  const unit = units === "us" ? "in" : "mm";

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="pool_id" value={poolId} />
        <input type="hidden" name="date" value={date} />
        <input type="hidden" name="units" value={units} />
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">Rain at your pool ({unit})</span>
          <span className="flex items-center gap-2">
            <input
              name="rain"
              type="number"
              inputMode="decimal"
              min="0"
              step={units === "us" ? "0.01" : "0.1"}
              required
              defaultValue={current ?? undefined}
              placeholder={units === "us" ? "0.5" : "12"}
              className={input}
              aria-describedby="rain-help"
            />
            <span className="text-sm text-muted">{unit}</span>
          </span>
          <span id="rain-help" className="text-xs text-muted">
            Enter 0 if it stayed dry at your pool.
          </span>
        </label>
        {state.error ? (
          <p role="alert" className="text-sm text-red-600">
            {state.error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="h-12 self-start rounded-xl bg-lagoon px-6 text-base font-semibold text-white hover:bg-lagoon-deep disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </form>
      {current !== null ? (
        <form action={clearRain}>
          <input type="hidden" name="pool_id" value={poolId} />
          <input type="hidden" name="date" value={date} />
          <button type="submit" className="text-sm font-semibold text-lagoon underline-offset-2 hover:underline">
            Use the area figure again
          </button>
        </form>
      ) : null}
    </div>
  );
}
