import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { safeNextPath } from "@/lib/auth/redirects";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Always rendered per request: depends on the session cookie.
export const dynamic = "force-dynamic";

/**
 * Where magic links land. Exchanges the one-time code (PKCE) or token hash for a
 * session cookie, then continues to the page the user wanted.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNextPath(searchParams.get("next"));
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const supabase = await createSupabaseServerClient();

  let failed = true;
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    failed = Boolean(error);
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    failed = Boolean(error);
  }

  if (failed) {
    const login = new URL("/login", origin);
    login.searchParams.set("error", "link");
    login.searchParams.set("next", next);
    return NextResponse.redirect(login);
  }

  // The database can see a brand-new token as "issued in the future" for about a second.
  await new Promise((resolve) => setTimeout(resolve, 1200));
  return NextResponse.redirect(new URL(next, origin));
}
