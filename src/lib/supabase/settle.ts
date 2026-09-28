import "server-only";

import * as Sentry from "@sentry/nextjs";
import { secondsAhead, settleWaitMs, tokenIssuedAt } from "./skew";

/** Seconds of clock gap worth reporting. */
const REPORT_AHEAD_S = 3;

/** Reports a sign-in token stamped ahead of our clock (no personal data: just the gap and where). */
export function reportClockSkew(where: string, accessToken: string | null | undefined): void {
  const iat = tokenIssuedAt(accessToken);
  if (iat === null) return;
  const ahead = secondsAhead(iat, Date.now());
  if (ahead < REPORT_AHEAD_S) return;
  console.warn(`[auth] token issued ${ahead.toFixed(1)} s ahead of the server clock (${where})`);
  Sentry.captureMessage("Sign-in token issued ahead of the server clock", {
    level: "warning",
    tags: { where, clock_ahead_s: String(Math.round(ahead)) },
  });
}

/**
 * Called right after sign-in, before the first database read: waits until the new
 * token's issued-at time has passed (at least 1.2 s, at most 20 s).
 */
export async function settleAfterSignIn(where: string, accessToken: string | null | undefined): Promise<void> {
  reportClockSkew(where, accessToken);
  const wait = settleWaitMs(tokenIssuedAt(accessToken), Date.now());
  // Send any report while we wait anyway, so a short-lived function does not drop it.
  await Promise.all([new Promise((resolve) => setTimeout(resolve, wait)), Sentry.flush(wait).catch(() => false)]);
}
