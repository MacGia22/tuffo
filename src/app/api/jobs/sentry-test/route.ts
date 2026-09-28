import * as Sentry from "@sentry/nextjs";
import { cronAuthorised } from "@/lib/auth/cron";
import { serverEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Sends one deliberate error to Sentry and reports its event id, to check that error
 * reporting works end to end. Same bearer token as the cron jobs.
 */
export async function GET(request: Request) {
  if (!cronAuthorised(request)) {
    return Response.json({ ok: false, error: "unauthorised" }, { status: 401 });
  }
  if (!serverEnv.sentryDsn()) {
    return Response.json({ ok: false, error: "SENTRY_DSN is not set" }, { status: 503 });
  }
  const eventId = Sentry.captureException(
    new Error("Sentry test error (sent on purpose from /api/jobs/sentry-test; contact test@example.com)"),
  );
  const sent = await Sentry.flush(5000);
  return Response.json({ ok: sent, eventId }, { status: sent ? 200 : 502 });
}
