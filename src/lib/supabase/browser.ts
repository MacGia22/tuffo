"use client";

import { createBrowserClient } from "@supabase/ssr";
import { requirePublicSupabase } from "@/lib/env";

/** Supabase client for Client Components. Uses only the publishable key. */
export function createSupabaseBrowserClient() {
  const { url, key } = requirePublicSupabase();
  return createBrowserClient(url, key);
}
