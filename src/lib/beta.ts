/**
 * Small pure helpers for the private beta: who is an admin, what counts as an email
 * address, a per-instance rate limiter for the waitlist, and the feedback link.
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Lower-cased, trimmed address, or null when it does not look like one. */
export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return EMAIL.test(email) && email.length <= 254 ? email : null;
}

/** ADMIN_EMAILS: comma- or space-separated addresses. */
export function parseAdminEmails(value: string | undefined): Set<string> {
  const out = new Set<string>();
  for (const part of (value ?? "").split(/[\s,;]+/)) {
    const email = normalizeEmail(part);
    if (email) out.add(email);
  }
  return out;
}

export function isAdminEmail(email: string | null | undefined, admins: Set<string>): boolean {
  const normalized = normalizeEmail(email);
  return normalized !== null && admins.has(normalized);
}

/**
 * Fixed-window counter kept in memory. Each server instance has its own, so it only
 * slows down a burst from one address; the global hourly cap in the database is the
 * backstop. Keys (IP addresses) never leave memory and expire with their window.
 */
export function createRateLimiter(options: { limit: number; windowMs: number; maxKeys?: number }) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  const maxKeys = options.maxKeys ?? 10_000;
  return function allow(key: string, now = Date.now()): boolean {
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      if (hits.size >= maxKeys) {
        for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
        if (hits.size >= maxKeys) hits.clear();
      }
      hits.set(key, { count: 1, resetAt: now + options.windowMs });
      return true;
    }
    entry.count += 1;
    return entry.count <= options.limit;
  };
}

/** mailto: link for the app footer, with the app version so a report can be traced. */
export function feedbackMailto(version: string): string {
  const subject = "Tuffo feedback";
  const body = `\n\n---\nApp version: ${version}`;
  return `mailto:hello@tuffo.app?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
