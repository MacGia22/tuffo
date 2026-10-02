import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * One more visit for a link label today. Production only (previews share the database).
 * Fails open: a missing table or key is logged and the page carries on.
 */
export async function countRefVisit(label: string): Promise<void> {
  if (process.env.VERCEL_ENV !== "production") return;
  try {
    const { error } = await createSupabaseAdminClient().rpc("count_ref_visit", { p_label: label });
    if (error) console.error(`[ref-visits] count: ${error.code ?? ""} ${error.message}`);
  } catch (error) {
    console.error(`[ref-visits] count: ${error instanceof Error ? error.message : "error"}`);
  }
}
