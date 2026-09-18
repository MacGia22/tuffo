import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/session";
import { safeNextPath } from "@/lib/auth/redirects";

/**
 * Session refresh plus optimistic access checks. Signed-out visitors asking for the
 * app are sent to sign in (and back afterwards); signed-in visitors skip the sign-in
 * page. Pages still verify the user themselves before touching data.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search, searchParams } = request.nextUrl;

  // A magic link that fell back to the site root (Supabase's Site URL) still carries
  // its code: hand it to the callback instead of showing the landing page.
  if (pathname === "/" && (searchParams.has("code") || searchParams.has("token_hash"))) {
    const callback = new URL("/auth/callback", request.url);
    callback.search = search;
    return NextResponse.redirect(callback);
  }

  const { response, user } = await updateSession(request);

  if (pathname.startsWith("/app") && !user) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(login);
  }

  if (pathname === "/login" && user) {
    const next = safeNextPath(request.nextUrl.searchParams.get("next"));
    return NextResponse.redirect(new URL(next, request.url));
  }

  return response;
}

export const config = {
  // Everything except static assets, generated images and API routes (which do their own auth).
  matcher: [
    "/((?!_next/static|_next/image|icon.svg|apple-icon|opengraph-image|pwa/|manifest.webmanifest|robots.txt|sitemap.xml|api/).*)",
  ],
};
