import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(self), payment=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The browser SDK reads the DSN at build time; one variable (SENTRY_DSN) serves both sides.
  env: {
    NEXT_PUBLIC_SENTRY_DSN: process.env.SENTRY_DSN?.trim() || process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() || "",
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

// Source maps go to Sentry only when SENTRY_AUTH_TOKEN (plus SENTRY_ORG and SENTRY_PROJECT)
// is set, and are deleted from the build afterwards so they are never served.
const uploadSourceMaps = Boolean(process.env.SENTRY_AUTH_TOKEN);

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  release: { name: process.env.VERCEL_GIT_COMMIT_SHA },
  sourcemaps: { disable: !uploadSourceMaps, deleteSourcemapsAfterUpload: true },
  // Browser reports go through the app itself (API routes skip src/proxy.ts), so ad
  // blockers do not drop them and the browser never talks to Sentry directly.
  tunnelRoute: "/api/monitoring",
  telemetry: false,
  silent: !process.env.CI,
});
