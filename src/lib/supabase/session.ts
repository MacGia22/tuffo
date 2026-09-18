import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicEnv } from "@/lib/env";

/**
 * Refreshes the Supabase session cookie on each app request so server code always
 * sees a valid user. Called from src/proxy.ts. A no-op when Supabase is not
 * configured or the visitor has no session.
 */
export async function updateSession(request: NextRequest) {
  const url = publicEnv.supabaseUrl();
  const key = publicEnv.supabasePublishableKey();
  if (!url || !key) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Touching the user is what triggers a refresh when the access token has expired.
  await supabase.auth.getUser();

  return response;
}
