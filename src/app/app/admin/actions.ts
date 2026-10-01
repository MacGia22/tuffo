"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/admin";
import { normalizeEmail, signupSource } from "@/lib/beta";
import { isFeedbackStatus } from "@/lib/feedback";
import { publicEnv } from "@/lib/env";
import { isUuid, text } from "@/lib/form-data";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** Back to the admin page with a message, keeping the feedback filters ("kind=idea&fstatus=new"). */
function done(status: string, filters: string | null = null): never {
  revalidatePath("/app/admin");
  const keep = new URLSearchParams(filters ?? "");
  const params = new URLSearchParams({ status });
  for (const key of ["kind", "fstatus"]) {
    const value = keep.get(key);
    if (value) params.set(key, value);
  }
  redirect(`/app/admin?${params}${filters === null ? "" : "#feedback"}`);
}

/**
 * Invites one address: Supabase creates the account and sends the "Invite user"
 * email, whose link signs the person in. Sign-ups stay closed for everyone else. The
 * address leaves the waitlist once invited, as the privacy notice promises; its link
 * label, if any, stays on the account.
 */
export async function inviteEmail(formData: FormData): Promise<void> {
  await requireAdmin();
  const email = normalizeEmail(text(formData, "email"));
  if (!email) done("bad-email");

  const admin = createSupabaseAdminClient();
  // The waitlist's link label moves onto the new account, as a sign-up through that link would.
  const { data: entry } = await admin.from("waitlist").select("source").eq("email", email).maybeSingle<{ source: string | null }>();
  const source = signupSource(entry?.source ?? null);
  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${publicEnv.siteUrl()}/auth/callback`,
    ...(source ? { data: { signup_source: source } } : {}),
  });
  const already = error && /already|registered|exists/i.test(error.message);
  if (error && !already) {
    console.error(`[admin] invite failed: ${error.status ?? ""} ${error.message}`);
    done("invite-failed");
  }
  await admin.from("waitlist").delete().eq("email", email);
  done(already ? "already-user" : "invited");
}

/** Removes an address from the waitlist without inviting it (for a removal request). */
export async function removeFromWaitlist(formData: FormData): Promise<void> {
  await requireAdmin();
  const email = normalizeEmail(text(formData, "email"));
  if (!email) done("bad-email");
  const { error } = await createSupabaseAdminClient().from("waitlist").delete().eq("email", email);
  done(error ? "remove-failed" : "removed");
}

/** Sets a feedback message's status (new, planned, done or declined). */
export async function setFeedbackStatus(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = text(formData, "id");
  const status = text(formData, "status");
  const back = text(formData, "back");
  if (!isUuid(id) || !isFeedbackStatus(status)) done("status-failed", back);
  const { error } = await createSupabaseAdminClient().from("feedback").update({ status }).eq("id", id);
  if (error) console.error(`[admin] feedback status: ${error.code ?? ""} ${error.message}`);
  done(error ? "status-failed" : "status-saved", back);
}
