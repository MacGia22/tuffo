import { unsubscribe } from "@/lib/alerts/job";
import { readUnsubscribeToken } from "@/lib/alerts/token";
import { serverEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * One-click unsubscribe (RFC 8058): mail apps POST here from the List-Unsubscribe header,
 * and the page at /alerts/unsubscribe posts here from its button. The signed token names
 * the person (and optionally one pool); no sign-in needed.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  let token = url.searchParams.get("t") ?? "";
  if (!token) {
    try {
      token = String((await request.formData()).get("t") ?? "");
    } catch {
      token = "";
    }
  }
  const secret = serverEnv.cronSecret();
  const target = secret ? readUnsubscribeToken(token, secret) : null;
  if (!target) return new Response("That link is not valid.", { status: 400 });
  try {
    await unsubscribe(createSupabaseAdminClient(), target.userId, target.poolId);
  } catch (err) {
    console.error(`[alerts] unsubscribe: ${err instanceof Error ? err.message : String(err)}`);
    return new Response("Could not update your alerts. Try again, or change them on your account page.", { status: 500 });
  }
  const back = request.headers.get("content-type")?.includes("form") ? "/alerts/unsubscribe?done=1" : null;
  return back ? Response.redirect(new URL(back, url.origin), 303) : new Response("Alerts switched off.", { status: 200 });
}
