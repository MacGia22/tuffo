import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { requirePublicSupabase } from "@/lib/env";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 * Runs as the signed-in user (row-level security applies). Create one per request.
 */
export async function createSupabaseServerClient() {
  // cookies() first: it marks the route dynamic before any configuration check runs.
  const cookieStore = await cookies();
  const { url, key } = requirePublicSupabase();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot set cookies; the proxy refreshes sessions instead.
        }
      },
    },
  });
}
