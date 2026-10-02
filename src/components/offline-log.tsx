"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { isNetworkError, offsetAt, queueEntry, WHEN_FIELD } from "@/lib/offline/client";
import type { QueueKind } from "@/lib/offline/queue";

/**
 * What the three log forms share for offline use. On submit it stamps the browser's
 * time-zone offset and a new entry's device id (client_id). Without a connection, a new
 * entry goes to the queue on the device instead of the server; the same happens when
 * the request fails on the way. Edits need a connection.
 */
export function useOfflineLog<S>(kind: QueueKind, editing: boolean, action: (prev: S, formData: FormData) => Promise<S>) {
  const [queued, setQueued] = useState(false);
  const tzOffset = useRef<HTMLInputElement>(null);
  const clientId = useRef<HTMLInputElement>(null);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    // datetime-local carries no zone; send the browser's offset at that time so the server
    // can place it (a back-dated entry across a daylight-saving change has a different one).
    const when = new FormData(event.currentTarget).get(WHEN_FIELD[kind]);
    if (tzOffset.current) tzOffset.current.value = String(offsetAt(typeof when === "string" ? when : null));
    if (!editing && clientId.current && !clientId.current.value) clientId.current.value = crypto.randomUUID();
    if (!editing && !navigator.onLine) {
      event.preventDefault();
      void queueEntry(kind, new FormData(event.currentTarget)).then(() => setQueued(true));
    }
  }

  /** The server action, falling back to the queue when the request never got an answer. */
  async function submit(prev: S, formData: FormData): Promise<S> {
    try {
      return await action(prev, formData);
    } catch (error) {
      if (editing || !isNetworkError(error)) throw error;
      await queueEntry(kind, formData);
      setQueued(true);
      return prev;
    }
  }

  const hidden = (
    <>
      <input type="hidden" name="tz_offset" ref={tzOffset} defaultValue="0" />
      {editing ? null : <input type="hidden" name="client_id" ref={clientId} defaultValue="" />}
    </>
  );

  return { queued, onSubmit, submit, hidden };
}

export function QueuedNotice({ poolId, what }: { poolId: string; what: string }) {
  return (
    <div role="status" className="flex max-w-xl flex-col items-start gap-3 rounded-2xl border border-sun/60 bg-sun/10 p-5">
      <p className="text-lg font-semibold">Saved on this device</p>
      <p className="text-sm">
        You are offline. Tuffo keeps the {what} here and sends it as soon as you are back online; the top of the page
        shows what is waiting.
      </p>
      <div className="flex flex-wrap gap-2">
        <Link href={`/app/pools/${poolId}`} className="rounded-xl bg-action px-4 py-2.5 text-sm font-semibold text-white hover:bg-action-deep">
          Back to the pool
        </Link>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold hover:border-lagoon"
        >
          Log another
        </button>
      </div>
    </div>
  );
}
