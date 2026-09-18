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
  waitlistWebhookUrl: () => first("WAITLIST_WEBHOOK_URL"),
  /** Shared secret the Vercel cron sends as a bearer token to /api/jobs/*. */
  cronSecret: () => first("CRON_SECRET"),
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
