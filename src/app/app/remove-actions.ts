"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/user";
import { isUuid } from "@/lib/form-data";
import { recomputeAfterResponse } from "@/lib/model/recompute";
import { isRemovableKind, pickRestorable, RESTORE_COLUMNS, type RemovableKind } from "@/lib/removed";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const TABLES = {
  reading: "readings",
  dose: "doses",
  event: "events",
  maintenance: "pool_maintenance",
  pressure: "pool_pressure",
} as const;

/** Tests, doses and events feed the chlorine model; upkeep and pressure do not. */
const MODEL_INPUTS = new Set<RemovableKind>(["reading", "dose", "event"]);

/**
 * Removes a test, dose or event and returns the removed row, so the page can offer Undo.
 * Row-level security limits it to the person's own pools.
 */
export async function removeEntry(
  kind: string,
  id: string,
): Promise<{ ok: true; row: Record<string, unknown> } | { ok: false }> {
  if (!isRemovableKind(kind) || !isUuid(id)) return { ok: false };
  await requireUser("/app");
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from(TABLES[kind])
    .delete()
    .eq("id", id)
    .select(RESTORE_COLUMNS[kind].join(", "))
    .returns<Record<string, unknown>[]>();
  const row = data?.[0];
  if (!row || typeof row.pool_id !== "string") return { ok: false };
  // A removed test, dose or event changes what the chlorine model learned from.
  if (MODEL_INPUTS.has(kind)) recomputeAfterResponse(row.pool_id);
  revalidatePath(`/app/pools/${row.pool_id}`, "layout");
  return { ok: true, row };
}

/** Undo: puts a removed test, dose or event back with its own id. */
export async function restoreEntry(kind: string, row: unknown): Promise<boolean> {
  const clean = pickRestorable(kind, row);
  if (!clean || !isRemovableKind(kind)) return false;
  await requireUser("/app");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from(TABLES[kind]).insert(clean);
  if (error) return false;
  const poolId = clean.pool_id as string;
  if (MODEL_INPUTS.has(kind)) recomputeAfterResponse(poolId);
  revalidatePath(`/app/pools/${poolId}`, "layout");
  return true;
}
