import { scrubBreadcrumb, scrubEvent } from "./scrub";

/**
 * Settings shared by the browser, Node and edge set-ups. Without a DSN the SDK is
 * disabled and sends nothing. The release (the commit SHA) is injected at build time
 * by withSentryConfig in next.config.ts.
 */
export function sentryOptions(dsn: string | undefined) {
  return {
    dsn,
    enabled: Boolean(dsn),
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.VERCEL_ENV ?? "development",
    sendDefaultPii: false,
    // Every error, but only a small share of performance traces (free-plan quota).
    sampleRate: 1,
    tracesSampleRate: 0.05,
    beforeSend: scrubEvent,
    beforeSendTransaction: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  };
}
