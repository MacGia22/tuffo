/**
 * Tests, doses and events logged without a connection wait on the device and are sent
 * when it comes back. Each entry carries a client-generated UUID that the database
 * holds in a unique column, so sending one twice (a retry after a lost reply) can never
 * create a second row: the server answers "already saved". Storage is behind an
 * interface so this logic runs in tests without IndexedDB.
 */

export type QueueKind = "reading" | "dose" | "event";

export interface QueuedEntry {
  clientId: string;
  /** Whose entry it is; another account signed in on the device does not send it. */
  userId: string;
  poolId: string;
  kind: QueueKind;
  /** The form fields as they were submitted, with the time filled in when queued. */
  fields: Record<string, string>;
  queuedAt: string;
  attempts: number;
  /** Set when the server refused it (bad value); it stays until the person discards it. */
  error?: string;
}

export interface QueueStore {
  all(): Promise<QueuedEntry[]>;
  put(entry: QueuedEntry): Promise<void>;
  remove(clientId: string): Promise<void>;
}

export type SendResult = { status: "saved" } | { status: "rejected"; error: string } | { status: "offline" };

export interface FlushResult {
  saved: number;
  rejected: number;
  waiting: number;
}

/** Entries for this account, oldest first. */
export async function pendingFor(store: QueueStore, userId: string): Promise<QueuedEntry[]> {
  return (await store.all()).filter((e) => e.userId === userId).sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
}

/**
 * Sends waiting entries in the order they were logged. Stops at the first sign the
 * connection is gone and keeps the rest; a refused entry keeps its error for the page
 * to show.
 */
export async function flushQueue(
  store: QueueStore,
  userId: string,
  send: (entry: QueuedEntry) => Promise<SendResult>,
): Promise<FlushResult> {
  const result: FlushResult = { saved: 0, rejected: 0, waiting: 0 };
  const entries = await pendingFor(store, userId);
  let offline = false;
  for (const entry of entries) {
    if (entry.error) {
      result.rejected += 1;
      continue;
    }
    if (offline) {
      result.waiting += 1;
      continue;
    }
    const outcome = await send(entry);
    if (outcome.status === "saved") {
      await store.remove(entry.clientId);
      result.saved += 1;
    } else if (outcome.status === "rejected") {
      await store.put({ ...entry, attempts: entry.attempts + 1, error: outcome.error });
      result.rejected += 1;
    } else {
      await store.put({ ...entry, attempts: entry.attempts + 1 });
      offline = true;
      result.waiting += 1;
    }
  }
  return result;
}

/** How the server's answer to POST /api/log maps to a send result. */
export function sendResultFrom(status: number, body: unknown): SendResult {
  const error = body && typeof body === "object" && "error" in body ? String((body as { error: unknown }).error) : null;
  if (status >= 200 && status < 300) return { status: "saved" };
  // Signed out, or the server is having trouble: try again later.
  if (status === 401 || status === 408 || status === 429 || status >= 500) return { status: "offline" };
  return { status: "rejected", error: error ?? "Tuffo could not save this entry." };
}

/** An in-memory store, for tests and browsers without IndexedDB. */
export function memoryStore(initial: QueuedEntry[] = []): QueueStore & { entries: Map<string, QueuedEntry> } {
  const entries = new Map(initial.map((e) => [e.clientId, e]));
  return {
    entries,
    async all() {
      return [...entries.values()];
    },
    async put(entry) {
      entries.set(entry.clientId, entry);
    },
    async remove(clientId) {
      entries.delete(clientId);
    },
  };
}
