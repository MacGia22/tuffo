import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { oauthErrorKind } from "@/lib/auth/oauth";
import { safeNextPath } from "@/lib/auth/redirects";
import { settleAfterSignIn } from "@/lib/supabase/settle";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Always rendered per request: depends on the session cookie.
export const dynamic = "force-dynamic";
// Room for the wait after sign-in (see settleAfterSignIn).
export const maxDuration = 30;

/**
 * Where magic links and Google sign-ins land. Exchanges the one-time code (PKCE) or token hash for a
 * session cookie, then continues to the page the user wanted.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNextPath(searchParams.get("next"));
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  // Google or Supabase sent the person back with an error instead of a code.
  const providerError = oauthErrorKind(searchParams.get("error"), searchParams.get("error_description"));
  if (providerError) {
    const login = new URL("/login", origin);
    login.searchParams.set("error", providerError);
    login.searchParams.set("next", next);
    return NextResponse.redirect(login);
  }

  const supabase = await createSupabaseServerClient();

  let failed = true;
  let accessToken: string | undefined;
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    failed = Boolean(error);
    accessToken = data.session?.access_token;
  } else if (tokenHash && type) {
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    failed = Boolean(error);
    accessToken = data.session?.access_token;
  }

  if (failed) {
    const login = new URL("/login", origin);
    login.searchParams.set("error", "link");
    login.searchParams.set("next", next);
    return NextResponse.redirect(login);
  }

  // The database can see a brand-new token as "issued in the future"; wait until it is not.
  await settleAfterSignIn("callback", accessToken);
  return NextResponse.redirect(new URL(next, origin));
}
