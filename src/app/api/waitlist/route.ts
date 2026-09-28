import { createRateLimiter, normalizeEmail, normalizeSource } from "@/lib/beta";
import { serverEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** At most 5 sign-ups per address per 10 minutes, per server instance. */
const allowIp = createRateLimiter({ limit: 5, windowMs: 10 * 60_000 });
const DEFAULT_HOURLY_LIMIT = 100;

const CLOSED = { ok: false, message: "The waitlist opens with the beta. Check back soon." };
const BUSY = { ok: false, message: "Too many sign-ups right now. Try again in a few minutes." };

function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

function hourlyLimit(): number {
  const n = Number(serverEnv.waitlistHourlyLimit());
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_HOURLY_LIMIT;
}

/**
 * Waitlist sign-up, stored in the server-only waitlist table. Answers the same way
 * whether or not the address was already on the list. Limits: a hidden field bots
 * fill in, a per-address burst limit (the IP is held in memory only, never stored),
 * and a cap on sign-ups per hour across everyone. The source is the link's ?ref=
 * label (see normalizeSource). Until the table exists the form says the list is not
 * open yet.
 */
export async function POST(request: Request) {
  let body: { email?: unknown; website?: unknown; source?: unknown };
  try {
    body = (await request.json()) as { email?: unknown; website?: unknown; source?: unknown };
  } catch {
    return Response.json({ ok: false, message: "Send a JSON body with an email." }, { status: 400 });
  }

  // Honeypot: people never see this field, so anything in it came from a bot.
  if (typeof body.website === "string" && body.website.trim() !== "") return Response.json({ ok: true });

  const email = normalizeEmail(body.email);
  if (!email) {
    return Response.json({ ok: false, message: "That email address does not look right." }, { status: 400 });
  }
  if (!allowIp(clientIp(request))) return Response.json(BUSY, { status: 429 });

  let admin;
  try {
    admin = createSupabaseAdminClient();
  } catch {
    return Response.json(CLOSED, { status: 503 });
  }

  const since = new Date(Date.now() - 3_600_000).toISOString();
  const { count, error: countError } = await admin
    .from("waitlist")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since);
  if (countError) {
    console.error(`[waitlist] count: ${countError.code ?? ""} ${countError.message}`);
    return Response.json(CLOSED, { status: 503 });
  }
  if ((count ?? 0) >= hourlyLimit()) return Response.json(BUSY, { status: 429 });

  const { error } = await admin
    .from("waitlist")
    .upsert({ email, source: normalizeSource(body.source) }, { onConflict: "email", ignoreDuplicates: true });
  if (error) {
    console.error(`[waitlist] insert: ${error.code ?? ""} ${error.message}`);
    return Response.json({ ok: false, message: "Could not save that right now." }, { status: 502 });
  }
  return Response.json({ ok: true });
}
