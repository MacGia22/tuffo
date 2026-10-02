"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { discardEntry, flushNow, pendingEntries, QUEUE_EVENT, setQueueUser } from "@/lib/offline/client";
import type { QueuedEntry } from "@/lib/offline/queue";

const KIND_LABEL: Record<QueuedEntry["kind"], string> = { reading: "Test", dose: "Dose", event: "Event" };

function describe(entry: QueuedEntry): string {
  const when = entry.fields.taken_at || entry.fields.added_at || entry.fields.occurred_at || entry.queuedAt;
  return `${KIND_LABEL[entry.kind]} from ${when.replace("T", " ").slice(0, 16)}`;
}

/**
 * Registers the service worker and sends entries logged offline once the device is
 * back online (on load, on reconnect, when the app comes to the front). Shows what is
 * waiting, and anything the server refused with its reason and a way to discard it.
 */
export function OfflineSync({ userId }: { userId: string }) {
  const router = useRouter();
  const [entries, setEntries] = useState<QueuedEntry[]>([]);
  const [online, setOnline] = useState(true);
  const [sent, setSent] = useState(0);

  const refresh = useCallback(async () => {
    try {
      setEntries(await pendingEntries());
    } catch {
      setEntries([]);
    }
  }, []);

  const send = useCallback(async () => {
    if (!navigator.onLine) return;
    try {
      const result = await flushNow();
      if (result.saved > 0) {
        setSent(result.saved);
        router.refresh();
      }
    } catch {
      // IndexedDB unavailable (private mode on some browsers): nothing was queued either.
    }
  }, [router]);

  useEffect(() => {
    setQueueUser(userId);
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
    const update = () => {
      setOnline(navigator.onLine);
      void refresh();
    };
    const reconnect = () => {
      setOnline(true);
      void send();
    };
    const visible = () => {
      if (document.visibilityState === "visible") void send();
    };
    const queued = () => {
      void refresh();
      if (navigator.onLine) void send();
    };
    // First look once the page is interactive.
    const first = window.setTimeout(() => {
      update();
      void send();
    }, 0);
    window.addEventListener("online", reconnect);
    window.addEventListener("offline", update);
    window.addEventListener(QUEUE_EVENT, queued);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.clearTimeout(first);
      window.removeEventListener("online", reconnect);
      window.removeEventListener("offline", update);
      window.removeEventListener(QUEUE_EVENT, queued);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [userId, refresh, send]);

  const waiting = entries.filter((e) => !e.error);
  const refused = entries.filter((e) => e.error);

  if (waiting.length === 0 && refused.length === 0) {
    if (!online) {
      return (
        <p role="status" className="rounded-xl bg-chip-warn-bg px-4 text-chip-warn-fg py-2 text-sm">
          You are offline. Tests, doses and events you log are kept on this device and sent when you are back.
        </p>
      );
    }
    return sent > 0 ? (
      <p role="status" className="rounded-xl bg-lagoon/10 px-4 py-2 text-sm">
        Sent {sent} {sent === 1 ? "entry" : "entries"} logged while offline.
      </p>
    ) : null;
  }

  return (
    <section role="status" aria-label="Waiting to send" className="flex flex-col gap-2 rounded-2xl border border-chip-warn-fg/40 bg-chip-warn-bg text-chip-warn-fg px-4 py-3 text-sm">
      {waiting.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p>
            <span className="font-semibold">
              {waiting.length} {waiting.length === 1 ? "entry" : "entries"} waiting to send.
            </span>{" "}
            {online ? "Sending now…" : "They go as soon as you are back online."}
          </p>
          {online ? (
            <button type="button" onClick={() => void send()} className="rounded-lg border border-border bg-surface px-3 py-1.5 font-semibold">
              Send now
            </button>
          ) : null}
        </div>
      ) : null}
      {refused.map((entry) => (
        <div key={entry.clientId} className="flex flex-wrap items-center justify-between gap-2">
          <p>
            <span className="font-semibold">{describe(entry)} was not saved:</span> {entry.error}
          </p>
          <button
            type="button"
            onClick={() => void discardEntry(entry.clientId).then(refresh)}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 font-semibold"
          >
            Discard
          </button>
        </div>
      ))}
    </section>
  );
}
