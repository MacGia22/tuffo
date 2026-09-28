import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/lib/sentry/options";

/** Error reporting for server code (Node and edge); off until SENTRY_DSN is set. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge") {
    Sentry.init(sentryOptions(process.env.SENTRY_DSN?.trim() || undefined));
  }
}

export const onRequestError = Sentry.captureRequestError;
