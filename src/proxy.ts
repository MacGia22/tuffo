import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/session";
import { needsSession, safeNextPath } from "@/lib/auth/redirects";
import { refToCount } from "@/lib/ref-visits";
import { countRefVisit } from "@/lib/ref-visits-store";

/**
 * Session refresh plus optimistic access checks, for the app, sign-in and auth paths
 * only: public pages (and their prefetches) skip the call to Supabase Auth. Signed-out
 * visitors asking for the app are sent to sign in (and back afterwards); signed-in
 * visitors skip the sign-in page. Pages still verify the user themselves before
 * touching data. On every path, a page load from a ?ref= link adds one to that label's
 * count for the day, after the response.
 */
export async function proxy(request: NextRequest, event: NextFetchEvent) {
  const { pathname, search, searchParams } = request.nextUrl;

  const label = refToCount({
    method: request.method,
    pathname,
    ref: searchParams.get("ref"),
    header: (name) => request.headers.get(name),
  });
  if (label) event.waitUntil(countRefVisit(label));

  // A magic link that fell back to the site root (Supabase's Site URL) still carries
  // its code: hand it to the callback instead of showing the landing page.
  if (pathname === "/" && (searchParams.has("code") || searchParams.has("token_hash"))) {
    const callback = new URL("/auth/callback", request.url);
    callback.search = search;
    return NextResponse.redirect(callback);
  }

  if (!needsSession(pathname)) return NextResponse.next({ request });

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
    "/((?!_next/static|_next/image|icon.svg|apple-icon|opengraph-image|pwa/|screens/|manifest.webmanifest|sw.js|offline|robots.txt|sitemap.xml|api/).*)",
  ],
};
