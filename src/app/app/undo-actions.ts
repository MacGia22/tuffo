"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/user";
import { recomputeAfterResponse } from "@/lib/model/recompute";
import { parseSaved } from "@/lib/return-to";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const TABLES = { reading: "readings", dose: "doses", event: "events", pump: "pump_schedules" } as const;

/**
 * "Undo" after a save: removes the row just added (a test, dose, event or pump
 * schedule). Row-level security limits it to the person's own pools. Returns whether a
 * row was removed.
 */
export async function undoSaved(token: string): Promise<boolean> {
  const parsed = parseSaved(token);
  if (!parsed || parsed === "saved") return false;
  await requireUser("/app");
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from(TABLES[parsed.kind])
    .delete()
    .eq("id", parsed.id)
    .select("pool_id")
    .returns<{ pool_id: string }[]>();
  const poolId = data?.[0]?.pool_id;
  if (!poolId) return false;
  // The removed row changes what the chlorine model learned from.
  recomputeAfterResponse(poolId);
  revalidatePath(`/app/pools/${poolId}`, "layout");
  return true;
}
