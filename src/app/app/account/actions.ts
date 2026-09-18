"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/user";
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
 * Deletes the account and everything under it. Pools, readings, doses and events
 * cascade from auth.users; the profile row too. The confirmation word is checked
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

  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/?deleted=1");
}
