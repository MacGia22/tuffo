import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Always rendered per request: depends on the session cookie.
export const dynamic = "force-dynamic";

/** Ends the session. POST only, so a link or prefetch can never sign someone out. */
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}
