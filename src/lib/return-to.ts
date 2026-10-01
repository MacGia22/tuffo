/**
 * Where a form goes back to after Save or Cancel: the page the person came from, passed
 * as `?from=` and carried in a hidden `return_to` field. Only paths inside the app are
 * accepted (never another site), and a "Saved" marker from an earlier save is dropped.
 */

const MAX_LENGTH = 300;

/** A same-site path under /app, or the fallback. */
export function safeReturnTo(value: unknown, fallback: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_LENGTH) return fallback;
  if (!/^\/app(?=$|[/?#])/.test(value)) return fallback;
  // No protocol-relative tricks, backslashes, control characters or parent paths.
  if (/\/\/|\\|[\u0000-\u001f\u007f]|(^|\/)\.\.(\/|$)/.test(value)) return fallback;
  return withoutSaved(value);
}

function split(path: string): { base: string; query: string; hash: string } {
  const hashAt = path.indexOf("#");
  const hash = hashAt >= 0 ? path.slice(hashAt) : "";
  const rest = hashAt >= 0 ? path.slice(0, hashAt) : path;
  const queryAt = rest.indexOf("?");
  return queryAt >= 0
    ? { base: rest.slice(0, queryAt), query: rest.slice(queryAt + 1), hash }
    : { base: rest, query: "", hash };
}

function join(base: string, params: URLSearchParams, hash: string): string {
  const query = params.toString();
  return `${base}${query ? `?${query}` : ""}${hash}`;
}

export function withoutSaved(path: string): string {
  const { base, query, hash } = split(path);
  const params = new URLSearchParams(query);
  params.delete("saved");
  return join(base, params, hash);
}

/** The path with the "Saved" marker the next page shows: "1", or "<kind>.<id>" for Undo. */
export function withSaved(path: string, token: string): string {
  const { base, query, hash } = split(withoutSaved(path));
  const params = new URLSearchParams(query);
  params.set("saved", token);
  return join(base, params, hash);
}

/** `?from=` for a link to a form, from the current page. */
export function fromParam(current: string): string {
  return `from=${encodeURIComponent(withoutSaved(current))}`;
}

export const UNDO_KINDS = ["reading", "dose", "event", "pump"] as const;
export type UndoKind = (typeof UNDO_KINDS)[number];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The marker read back: an undoable new row, or a plain "Saved". */
export function parseSaved(token: string | null | undefined): { kind: UndoKind; id: string } | "saved" | null {
  if (!token) return null;
  const [kind, id] = token.split(".");
  if ((UNDO_KINDS as readonly string[]).includes(kind) && id && UUID.test(id)) return { kind: kind as UndoKind, id };
  return "saved";
}
