"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/user";
import { isUuid } from "@/lib/form-data";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface AccountState {
  message?: string;
  error?: string;
}

export async function updateUnits(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const user = await requireUser("/app/account");
  const units = String(formData.get("units")) === "metric" ? "metric" : "us";
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("profiles").update({ units }).eq("id", user.id);
  if (error) return { error: `Could not save (${error.message}).` };
  revalidatePath("/app", "layout");
  return { message: units === "us" ? "Showing gallons and °F." : "Showing liters and °C." };
}

/**
 * Deletes the account and everything under it. Pools (with their readings, doses,
 * events and 7-day plans), scans and feedback cascade from auth.users; the profile row too, and any waitlist entry for the same
 * address is removed. The confirmation word is checked
 * server-side so a stray click cannot do it.
 */
export async function deleteAccount(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const user = await requireUser("/app/account");
  if (String(formData.get("confirm") ?? "").trim().toUpperCase() !== "DELETE") {
    return { error: "Type DELETE to confirm." };
  }
  const admin = createSupabaseAdminClient();
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return { error: `Could not delete the account (${error.message}). Write to privacy@tuffo.app.` };
  if (user.email) {
    const { error: waitlistError } = await admin.from("waitlist").delete().eq("email", user.email.toLowerCase());
    if (waitlistError) console.error(`[account] waitlist cleanup: ${waitlistError.message}`);
  }

  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/?deleted=1");
}

export interface AlertState {
  message?: string;
  error?: string;
}

/** Saves one pool's email alert choices. Row-level security limits it to the owner's pools. */
export async function saveAlertSettings(_prev: AlertState, formData: FormData): Promise<AlertState> {
  await requireUser("/app/account");
  const poolId = String(formData.get("pool_id") ?? "");
  if (!isUuid(poolId)) return { error: "Unknown pool." };
  const days = Number(formData.get("test_after_days") ?? 7);
  if (!Number.isInteger(days) || days < 1 || days > 60) return { error: "Pick between 1 and 60 days." };
  const on = (name: string) => formData.get(name) === "on";

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("alert_settings").upsert(
    {
      pool_id: poolId,
      algae: on("algae"),
      test_reminder: on("test_reminder"),
      test_after_days: days,
      weekly: on("weekly"),
      maintenance: on("maintenance"),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "pool_id" },
  );
  if (error) return { error: /alert_settings/.test(error.message) ? "Alerts are not available yet. Try again in a few minutes." : `Could not save (${error.message}).` };
  revalidatePath("/app/account");
  const any = on("algae") || on("test_reminder") || on("weekly") || on("maintenance");
  return { message: any ? "Saved. Emails come from hello@tuffo.app, at most one a day." : "Saved. No alert emails for this pool." };
}
