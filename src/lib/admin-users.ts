/**
 * The admin Users list: each account's email, when it signed up, when it last signed in,
 * and where it came from. Pure; the admin page loads the accounts with the service key.
 */

export interface AuthUserLike {
  id: string;
  email?: string | null;
  created_at: string;
  last_sign_in_at?: string | null;
  invited_at?: string | null;
  user_metadata?: Record<string, unknown> | null;
}

export interface UserRow {
  id: string;
  email: string;
  signedUpAt: string;
  /** Null when the person has not signed in yet (an invitation not yet used). */
  lastSignInAt: string | null;
  /** The ?ref= label that brought them, else "invited" or "direct". */
  source: string;
}

/** Where an account came from: its link label, else invited by the admin, else signed up directly. */
export function userSource(user: AuthUserLike): string {
  const label = user.user_metadata?.signup_source;
  if (typeof label === "string" && label.trim() !== "") return label;
  return user.invited_at ? "invited" : "direct";
}

/** Newest sign-ups first. */
export function userRows(users: AuthUserLike[]): UserRow[] {
  return users
    .map((u) => ({
      id: u.id,
      email: u.email ?? "(no email)",
      signedUpAt: u.created_at,
      lastSignInAt: u.last_sign_in_at ?? null,
      source: userSource(u),
    }))
    .sort((a, b) => (a.signedUpAt < b.signedUpAt ? 1 : a.signedUpAt > b.signedUpAt ? -1 : 0));
}

/** "reddit 3 · invited 2 · direct 1": how many accounts each source brought, most first. */
export function sourceCounts(rows: Pick<UserRow, "source">[]): { source: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.source, (counts.get(r.source) ?? 0) + 1);
  return [...counts.entries()]
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source));
}
