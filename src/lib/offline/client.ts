"use client";

import { idbStore } from "./idb";
import { flushQueue, pendingFor, sendResultFrom, type FlushResult, type QueuedEntry, type QueueKind } from "./queue";

/**
 * The browser side of offline logging: put an entry in the queue, send the queue, and
 * tell the page when either happened (a "tuffo:queue" event on window).
 */

export const QUEUE_EVENT = "tuffo:queue";

let currentUser: string | null = null;

/** Set by OfflineSync in the app layout; entries are stored under this account. */
export function setQueueUser(userId: string): void {
  currentUser = userId;
}

const WHEN_FIELD: Record<QueueKind, string> = { reading: "taken_at", dose: "added_at", event: "occurred_at" };

function localNow(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

/**
 * Stores a submitted log form on the device. "Now" is fixed to the moment it was
 * logged, not the moment it is sent.
 */
export async function queueEntry(kind: QueueKind, formData: FormData): Promise<void> {
  if (!currentUser) throw new Error("No account for the offline queue.");
  const fields: Record<string, string> = {};
  for (const [key, value] of formData.entries()) if (typeof value === "string") fields[key] = value;
  if (!fields.client_id) fields.client_id = crypto.randomUUID();
  if (!fields[WHEN_FIELD[kind]]) fields[WHEN_FIELD[kind]] = localNow();
  fields.tz_offset = String(new Date().getTimezoneOffset());
  const entry: QueuedEntry = {
    clientId: fields.client_id,
    userId: currentUser,
    poolId: fields.pool_id ?? "",
    kind,
    fields,
    queuedAt: new Date().toISOString(),
    attempts: 0,
  };
  await idbStore.put(entry);
  window.dispatchEvent(new Event(QUEUE_EVENT));
}

export async function pendingEntries(): Promise<QueuedEntry[]> {
  return currentUser ? pendingFor(idbStore, currentUser) : [];
}

export async function discardEntry(clientId: string): Promise<void> {
  await idbStore.remove(clientId);
  window.dispatchEvent(new Event(QUEUE_EVENT));
}

let flushing: Promise<FlushResult> | null = null;

/** Sends what is waiting; one run at a time. */
export function flushNow(): Promise<FlushResult> {
  if (!currentUser) return Promise.resolve({ saved: 0, rejected: 0, waiting: 0 });
  const user = currentUser;
  flushing ??= flushQueue(idbStore, user, async (entry) => {
    try {
      const response = await fetch("/api/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: entry.kind, fields: entry.fields }),
      });
      const body: unknown = await response.json().catch(() => null);
      return sendResultFrom(response.status, body);
    } catch {
      return { status: "offline" };
    }
  }).finally(() => {
    flushing = null;
    window.dispatchEvent(new Event(QUEUE_EVENT));
  });
  return flushing;
}

/** True for the error a server action throws when the request never got an answer. */
export function isNetworkError(error: unknown): boolean {
  return error instanceof TypeError || (typeof navigator !== "undefined" && !navigator.onLine);
}
