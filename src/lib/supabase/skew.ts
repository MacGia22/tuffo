/**
 * "JWT issued at future": the auth server stamps a new session a moment ahead of the
 * database's clock, and the database refuses it until its own clock catches up. Right
 * after sign-in the app reads the stamp (iat) on the new token, waits until it is in
 * the past by our clock (plus a margin), and reports large gaps so they can be seen.
 */

/** The token's issued-at time in seconds, or null when it cannot be read. */
export function tokenIssuedAt(accessToken: string | null | undefined): number | null {
  const payload = accessToken?.split(".")[1];
  if (!payload) return null;
  try {
    const json = JSON.parse(Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    return typeof json.iat === "number" ? json.iat : null;
  } catch {
    return null;
  }
}

/** How far the token's stamp is ahead of our clock, in seconds (negative when behind). */
export function secondsAhead(iatSeconds: number, nowMs: number): number {
  return iatSeconds - nowMs / 1000;
}

export const SETTLE_MIN_MS = 1200;
export const SETTLE_MAX_MS = 20_000;
const MARGIN_MS = 1500;

/** How long to wait before using a new token: until its stamp is past, plus a margin; within bounds. */
export function settleWaitMs(iatSeconds: number | null, nowMs: number): number {
  if (iatSeconds === null) return SETTLE_MIN_MS;
  const ahead = iatSeconds * 1000 - nowMs + MARGIN_MS;
  return Math.min(SETTLE_MAX_MS, Math.max(SETTLE_MIN_MS, Math.round(ahead)));
}
