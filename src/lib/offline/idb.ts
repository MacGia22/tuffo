import type { QueuedEntry, QueueStore } from "./queue";

/** The queue in IndexedDB ("tuffo-offline" → "queue", keyed by clientId). Browser only. */

const DB = "tuffo-offline";
const STORE = "queue";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: "clientId" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = work(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export const idbStore: QueueStore = {
  all: () => run("readonly", (s) => s.getAll() as IDBRequest<QueuedEntry[]>),
  put: async (entry) => {
    await run("readwrite", (s) => s.put(entry));
  },
  remove: async (clientId) => {
    await run("readwrite", (s) => s.delete(clientId));
  },
};
