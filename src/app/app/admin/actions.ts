"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/admin";
import { normalizeEmail } from "@/lib/beta";
import { publicEnv } from "@/lib/env";
import { text } from "@/lib/form-data";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function done(status: string): never {
  revalidatePath("/app/admin");
  redirect(`/app/admin?status=${status}`);
}

/**
 * Invites one address: Supabase creates the account and sends the "Invite user"
 * email, whose link signs the person in. Sign-ups stay closed for everyone else. The
 * address leaves the waitlist once invited, as the privacy notice promises.
 */
export async function inviteEmail(formData: FormData): Promise<void> {
  await requireAdmin();
  const email = normalizeEmail(text(formData, "email"));
  if (!email) done("bad-email");

  const admin = createSupabaseAdminClient();
  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${publicEnv.siteUrl()}/auth/callback`,
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
