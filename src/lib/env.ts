/**
 * Environment access in one place, so a missing variable fails loudly with a clear
 * name instead of an undefined somewhere deep in a request.
 *
 * Supabase issues two key formats; both are accepted:
 *   publishable key  sb_publishable_…  (or the legacy "anon" JWT)   → safe in the browser
 *   secret key       sb_secret_…       (or the legacy "service_role") → server only
 */

function first(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim() !== "") return value.trim();
  }
  return undefined;
}

/**
 * Accepts a bare host ("abc.supabase.co") as well as a full URL, and drops trailing
 * slashes so paths can be appended without producing "//".
 */
export function asBaseUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
  return withScheme.replace(/\/+$/, "");
}

export const publicEnv = {
  siteUrl: () => asBaseUrl(first("NEXT_PUBLIC_SITE_URL")) ?? "https://tuffo.app",
  supabaseUrl: () => asBaseUrl(first("NEXT_PUBLIC_SUPABASE_URL")),
  supabasePublishableKey: () =>
    first("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"),
};

export const serverEnv = {
  supabaseSecretKey: () => first("SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"),
  /** Optional cap on waitlist sign-ups per hour across everyone (default 100). */
  waitlistHourlyLimit: () => first("WAITLIST_HOURLY_LIMIT"),
  /**
   * Whether the site invites people to create an account (Supabase's "Allow new users to
   * sign up" must match). Anything but "false" means open. Read at build time for the
   * home page, so a change needs a redeploy.
   */
  signupsOpen: () => first("SIGNUPS_OPEN")?.toLowerCase() !== "false",
  /** Comma-separated emails that may use /app/admin (invites). Unset = nobody. */
  adminEmails: () => first("ADMIN_EMAILS"),
  /** Shared secret the Vercel cron sends as a bearer token to /api/jobs/*. */
  cronSecret: () => first("CRON_SECRET"),
  /** Enables photo scanning of test results (Anthropic API). */
  anthropicApiKey: () => first("ANTHROPIC_API_KEY"),
  scanModel: () => first("SCAN_MODEL"),
  /** Turns on error reporting to Sentry (server; the browser gets it at build time). */
  sentryDsn: () => first("SENTRY_DSN", "NEXT_PUBLIC_SENTRY_DSN"),
};

export function requirePublicSupabase(): { url: string; key: string } {
  const url = publicEnv.supabaseUrl();
  const key = publicEnv.supabasePublishableKey();
  if (!url || !key) {
    throw new Error(
      "Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }
  return { url, key };
}
