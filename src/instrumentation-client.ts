import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/lib/sentry/options";

// Error reporting in the browser. next.config.ts copies SENTRY_DSN into
// NEXT_PUBLIC_SENTRY_DSN at build time, so a new DSN needs a redeploy.
Sentry.init(sentryOptions(process.env.NEXT_PUBLIC_SENTRY_DSN || undefined));

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
