import "server-only";

import { createClient } from "@supabase/supabase-js";
import { publicEnv, serverEnv } from "@/lib/env";

/**
 * Service client for scheduled jobs and trusted server code only. It bypasses
 * row-level security, so it must never be reachable from a request that acts on
 * behalf of a user without its own checks.
 */
export function createSupabaseAdminClient() {
  const url = publicEnv.supabaseUrl();
  const key = serverEnv.supabaseSecretKey();
  if (!url || !key) {
    throw new Error("Supabase admin client is not configured: set SUPABASE_SERVICE_ROLE_KEY.");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
