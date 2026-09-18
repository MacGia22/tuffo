import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/session";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Everything except static assets, generated images and the public API routes.
  matcher: [
    "/((?!_next/static|_next/image|icon.svg|apple-icon|opengraph-image|pwa/|manifest.webmanifest|robots.txt|sitemap.xml|api/health|api/waitlist).*)",
  ],
};
