import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { sunShareFrom } from "@/engine/server";

/**
 * The share of the sun a pool's screen enclosure lets through, for the model and the plan.
 * Read on its own so it fails open: before the migration lands, or on any error, 1 (no
 * enclosure).
 */
export async function loadSunShare(client: SupabaseClient, poolId: string): Promise<number> {
  try {
    const { data, error } = await client
      .from("pools")
      .select("enclosure_sun_pct")
      .eq("id", poolId)
      .maybeSingle<{ enclosure_sun_pct: number | null }>();
    if (error || !data) return 1;
    return sunShareFrom(data.enclosure_sun_pct);
  } catch {
    return 1;
  }
}
