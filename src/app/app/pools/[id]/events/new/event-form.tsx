"use client";

import { useActionState, useState } from "react";
import { QueuedNotice, useOfflineLog } from "@/components/offline-log";
import { EVENT_KINDS, eventKindInfo, type EventKind } from "@/lib/events";
import type { Units } from "@/lib/format";
import { EditFields, type EditTarget } from "@/components/edit-fields";
import { saveEvent, type LogState } from "../../actions";

const initial: LogState = {};

const input =
  "h-11 w-full rounded-xl border border-border bg-surface px-3 text-base text-foreground outline-none placeholder:text-muted/70 focus:border-lagoon focus:ring-2 focus:ring-lagoon/30";

export function EventForm({ poolId, units, edit }: { poolId: string; units: Units; edit?: EditTarget }) {
  const offline = useOfflineLog("event", Boolean(edit), saveEvent);
  const [state, action, pending] = useActionState(offline.submit, initial);
  const f = state.fields ?? edit?.values ?? {};
  const [kind, setKind] = useState<EventKind>((f.kind as EventKind) || "refill");
  const info = eventKindInfo(kind);

  if (offline.queued) return <QueuedNotice poolId={poolId} what="event" />;

  return (
    <form action={action} onSubmit={offline.onSubmit} className="flex max-w-xl flex-col gap-6">
      <input type="hidden" name="pool_id" value={poolId} />
      <input type="hidden" name="units" value={units} />
      {offline.hidden}
      <EditFields edit={edit} whenField="occurred_at" />

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold">What happened?</legend>
        {EVENT_KINDS.map((e) => (
          <label
            key={e.kind}
            className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm ${
              kind === e.kind ? "border-lagoon bg-lagoon/5" : "border-border bg-surface"
            }`}
          >
            <input
              type="radio"
              name="kind"
              value={e.kind}
              checked={kind === e.kind}
              onChange={() => setKind(e.kind)}
              className="accent-lagoon"
            />
            {e.label}
          </label>
        ))}
      </fieldset>

      {info?.value === "depth" ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="value" className="text-sm font-semibold">
            How much did the water level change?{" "}
            <span className="font-normal text-muted">({units === "us" ? "inches" : "cm"}, optional)</span>
          </label>
          <input
            id="value"
            name="value"
            type="number"
            inputMode="decimal"
            step="any"
            min={0}
            defaultValue={f.value ?? ""}
            placeholder={units === "us" ? "2" : "5"}
            className={input}
          />
          <p className="text-xs text-muted">
            {kind === "drain_refill"
              ? "How far you lowered the level before refilling. Tuffo uses it to estimate how much stabilizer and salt were diluted."
              : "How far the level rose. Fresh water dilutes stabilizer and salt a little and brings in its own calcium."}
          </p>
        </div>
      ) : null}

      {info?.value === "count" ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="value" className="text-sm font-semibold">
            About how many swimmers? <span className="font-normal text-muted">(optional)</span>
          </label>
          <input id="value" name="value" type="number" inputMode="numeric" min={1} step={1} defaultValue={f.value ?? ""} className={input} />
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="occurred_at" className="text-sm font-semibold">
            When <span className="font-normal text-muted">{edit ? "(time at the pool)" : "(empty = now)"}</span>
          </label>
          <input id="occurred_at" name="occurred_at" type="datetime-local" defaultValue={f.occurred_at ?? ""} className={input} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="notes" className="text-sm font-semibold">
            Notes <span className="font-normal text-muted">{kind === "other" ? "(say what happened)" : "(optional)"}</span>
          </label>
          <input id="notes" name="notes" maxLength={2000} defaultValue={f.notes ?? ""} className={input} />
        </div>
      </div>

      {state.error ? (
        <p role="alert" className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="h-12 self-start rounded-xl bg-lagoon px-6 text-base font-semibold text-white transition hover:bg-lagoon-deep disabled:opacity-60"
      >
        {pending ? "Saving…" : edit ? "Save changes" : "Save"}
      </button>
    </form>
  );
}
