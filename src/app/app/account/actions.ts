"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/user";
import { isUuid } from "@/lib/form-data";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { failed } from "@/lib/errors";
import { deleteUserReportFiles, removeReportPhotos } from "@/lib/scan/report-store";

export interface AccountState {
  message?: string;
  error?: string;
}

export async function updateUnits(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const user = await requireUser("/app/account");
  const units = String(formData.get("units")) === "metric" ? "metric" : "us";
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("profiles").update({ units }).eq("id", user.id);
  if (error) return { error: failed("account", error.message) };
  revalidatePath("/app", "layout");
  return { message: units === "us" ? "Showing gallons and °F." : "Showing liters and °C." };
}

/**
 * Deletes the account and everything under it. Pools (with their readings, doses,
 * events and 7-day plans), scans, scan reports and feedback cascade from auth.users; the profile row too, and any waitlist entry for the same
 * address is removed. Shared scan photos do not cascade: they are removed from storage
 * first (and tried again after, if that failed). The confirmation word is checked
 * server-side so a stray click cannot do it.
 */
export async function deleteAccount(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const user = await requireUser("/app/account");
  if (String(formData.get("confirm") ?? "").trim().toUpperCase() !== "DELETE") {
    return { error: "Type DELETE to confirm." };
  }
  const admin = createSupabaseAdminClient();
  const filesGone = await deleteUserReportFiles(admin, user.id);
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return { error: failed("account delete", error.message, "Couldn't delete the account. Try again in a minute, or write to privacy@tuffo.app.") };
  if (!filesGone && !(await deleteUserReportFiles(admin, user.id))) {
    console.error("[account] shared scan photos left in storage after account delete; remove the user's folder in scan-reports");
  }
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
  if (error) return { error: /alert_settings/.test(error.message) ? "Alerts are not available yet. Try again in a few minutes." : failed("account", error.message) };
  revalidatePath("/app/account");
  const any = on("algae") || on("test_reminder") || on("weekly") || on("maintenance");
  return { message: any ? "Saved. Emails come from hello@tuffo.app, at most one a day." : "Saved. No alert emails for this pool." };
}

export interface PhotoState {
  message?: string;
  error?: string;
}

/**
 * Deletes one shared scan photo, or all of them ("all"), from storage and clears the
 * report's photo; the text report stays. The person's own client finds the rows (row-
 * level security limits it to theirs); the service client removes the files.
 */
export async function deleteScanPhotos(_prev: PhotoState, formData: FormData): Promise<PhotoState> {
  await requireUser("/app/account");
  const id = String(formData.get("id") ?? "");
  const all = id === "all";
  if (!all && !isUuid(id)) return { error: "Unknown photo." };

  const supabase = await createSupabaseServerClient();
  let query = supabase.from("scan_reports").select("id, photo_path").not("photo_path", "is", null);
  if (!all) query = query.eq("id", id);
  const { data, error } = await query.returns<{ id: string; photo_path: string | null }[]>();
  if (error) return { error: failed("scan photos", error.message) };
  if (!data || data.length === 0) {
    revalidatePath("/app/account");
    return { message: "Already deleted." };
  }
  const removed = await removeReportPhotos(createSupabaseAdminClient(), data);
  if (removed === null) return { error: "Couldn't delete the photo. Try again in a minute, or write to privacy@tuffo.app." };
  revalidatePath("/app/account");
  return { message: removed === 1 ? "Photo deleted." : `${removed} photos deleted.` };
}
