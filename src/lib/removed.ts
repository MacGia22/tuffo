/**
 * Undo after removing a test, dose or event. The server action that removes a row returns it;
 * the browser keeps that copy for the tab (sessionStorage, never a cookie) and the page
 * shows "Removed · Undo". Undo sends the copy back, and only the columns below are put
 * back, with the same id. Row-level security still decides whose pool it can go into.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const RESTORE_COLUMNS = {
  reading: [
    "id",
    "pool_id",
    "taken_at",
    "fc",
    "cc",
    "ph",
    "ta",
    "ch",
    "cya",
    "salt",
    "water_temp_c",
    "borate",
    "phosphate",
    "tds",
    "method",
    "notes",
    "client_id",
    "created_at",
  ],
  dose: ["id", "pool_id", "added_at", "product_id", "amount", "unit", "notes", "client_id", "created_at"],
  event: ["id", "pool_id", "occurred_at", "kind", "value", "notes", "client_id", "created_at"],
} as const;

export type RemovableKind = keyof typeof RESTORE_COLUMNS;

export function isRemovableKind(kind: string): kind is RemovableKind {
  return Object.prototype.hasOwnProperty.call(RESTORE_COLUMNS, kind);
}

/** The removed row cut down to what may be put back; null when it is not a row of that kind. */
export function pickRestorable(kind: string, row: unknown): Record<string, unknown> | null {
  if (!isRemovableKind(kind) || !row || typeof row !== "object" || Array.isArray(row)) return null;
  const source = row as Record<string, unknown>;
  if (typeof source.id !== "string" || !UUID.test(source.id)) return null;
  if (typeof source.pool_id !== "string" || !UUID.test(source.pool_id)) return null;
  const out: Record<string, unknown> = {};
  for (const column of RESTORE_COLUMNS[kind]) {
    const value = source[column];
    if (value === undefined) continue;
    if (value !== null && typeof value !== "string" && typeof value !== "number") return null;
    out[column] = value;
  }
  return out;
}

/** The `?saved=` marker after a removal: "removed.dose.<id>". */
export function removedToken(kind: RemovableKind, id: string): string {
  return `removed.${kind}.${id}`;
}

export function parseRemoved(token: string | null | undefined): { kind: RemovableKind; id: string } | null {
  if (!token) return null;
  const [marker, kind, id] = token.split(".");
  if (marker !== "removed" || !kind || !isRemovableKind(kind) || !id || !UUID.test(id)) return null;
  return { kind, id };
}

/** Where the tab keeps the removed row until Undo or the tab closes. */
export function removedKey(id: string): string {
  return `tuffo.removed.${id}`;
}
