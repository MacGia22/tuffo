import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * The signed-in user for this request, verified against Supabase; null when signed out.
 * Cached per request, so the app layout and the page share one check.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/** Like getCurrentUser, but sends signed-out visitors to the sign-in page. */
export async function requireUser(next?: string): Promise<User> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  }
  return user;
}
