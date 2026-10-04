"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/admin";
import { deleteBlock } from "@/lib/admin-users";
import { normalizeEmail, parseAdminEmails, signupSource } from "@/lib/beta";
import { isFeedbackStatus } from "@/lib/feedback";
import { publicEnv, serverEnv } from "@/lib/env";
import { isUuid, text } from "@/lib/form-data";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { extractReading } from "@/lib/scan/extract";
import { extractPumpSchedule } from "@/lib/scan/pump";
import { pumpRuns, reportLines, testReadOf, type ReportKind } from "@/lib/scan/report";
import { deleteUserReportFiles, removeReportPhotos, SCAN_REPORT_BUCKET } from "@/lib/scan/report-store";

/** Back to the admin page with a message, keeping the feedback filters ("kind=idea&fstatus=new"). */
function done(status: string, filters: string | null = null, anchor?: string): never {
  revalidatePath("/app/admin");
  const keep = new URLSearchParams(filters ?? "");
  const params = new URLSearchParams({ status });
  for (const key of ["kind", "fstatus"]) {
    const value = keep.get(key);
    if (value) params.set(key, value);
  }
  redirect(`/app/admin?${params}${anchor ? `#${anchor}` : filters === null ? "" : "#feedback"}`);
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

/**
 * Deletes someone's account and everything under it, as their own "Delete account"
 * does: pools with their logs and plans, scans and feedback cascade from auth.users, and
 * any waitlist entry for the address goes too. Never your own account or another admin's.
 */
export async function deleteUserAccount(formData: FormData): Promise<void> {
  const me = await requireAdmin();
  const id = text(formData, "id");
  if (!isUuid(id)) done("delete-failed");

  const admin = createSupabaseAdminClient();
  const { data: found, error: findError } = await admin.auth.admin.getUserById(id);
  if (findError || !found.user) done("delete-failed");
  const target = found.user;
  if (deleteBlock(target, me, parseAdminEmails(serverEnv.adminEmails()))) done("delete-blocked");

  // Shared scan photos do not cascade with the account: remove the user's folder first.
  const filesGone = await deleteUserReportFiles(admin, id);
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) {
    console.error(`[admin] delete user: ${error.status ?? ""} ${error.message}`);
    done("delete-failed");
  }
  if (!filesGone && !(await deleteUserReportFiles(admin, id))) {
    console.error("[admin] shared scan photos left in storage after account delete; remove the user's folder in scan-reports");
  }
  const email = normalizeEmail(target.email);
  if (email) {
    const { error: waitlistError } = await admin.from("waitlist").delete().eq("email", email);
    if (waitlistError) console.error(`[admin] waitlist cleanup: ${waitlistError.message}`);
  }
  done("user-deleted");
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

const REPORT_STATUSES = ["new", "reviewed", "fixed"] as const;

/** Marks a misread report new, reviewed or fixed. */
export async function setScanReportStatus(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = text(formData, "id");
  const status = text(formData, "status");
  if (!isUuid(id) || !REPORT_STATUSES.some((s) => s === status)) done("report-failed", null, "scan-reports");
  const { error } = await createSupabaseAdminClient().from("scan_reports").update({ status }).eq("id", id);
  if (error) console.error(`[admin] scan report status: ${error.code ?? ""} ${error.message}`);
  done(error ? "report-failed" : "report-saved", null, "scan-reports");
}

/** Deletes a report's shared photo from storage; the text report stays. */
export async function deleteScanReportPhoto(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = text(formData, "id");
  if (!isUuid(id)) done("report-failed", null, "scan-reports");
  const admin = createSupabaseAdminClient();
  const { data } = await admin.from("scan_reports").select("id, photo_path").eq("id", id).maybeSingle<{ id: string; photo_path: string | null }>();
  const removed = data ? await removeReportPhotos(admin, [data]) : 0;
  done(removed === null ? "report-failed" : "photo-deleted", null, "scan-reports");
}

export interface ReadAgainState {
  error?: string;
  confidence?: string;
  /** Per corrected field: first read, read now, the person's correction. */
  lines?: { label: string; before: string; again: string; corrected: string }[];
}

/**
 * Runs the current reader on a report's shared photo and compares it with the first
 * read and the person's correction. Not counted against anyone's allowance, not stored.
 */
export async function readScanReportAgain(_prev: ReadAgainState, formData: FormData): Promise<ReadAgainState> {
  await requireAdmin();
  const id = text(formData, "id");
  if (!isUuid(id)) return { error: "Unknown report." };
  const admin = createSupabaseAdminClient();
  const { data: report } = await admin
    .from("scan_reports")
    .select("kind, read, corrected, photo_path")
    .eq("id", id)
    .maybeSingle<{ kind: ReportKind; read: unknown; corrected: unknown; photo_path: string | null }>();
  if (!report?.photo_path) return { error: "This report has no photo." };
  const { data: file, error } = await admin.storage.from(SCAN_REPORT_BUCKET).download(report.photo_path);
  if (error || !file) return { error: "The photo could not be loaded." };

  try {
    const image = { bytes: Buffer.from(await file.arrayBuffer()), mediaType: "image/jpeg" as const };
    let again: Record<string, unknown>;
    let confidence: string;
    if (report.kind === "pump") {
      const result = await extractPumpSchedule(image);
      again = { rows: pumpRuns(result.rows.map((r) => ({ ...r, speed: r.speed === null ? "" : String(r.speed) }))), unit: result.unit };
      confidence = result.confidence;
    } else {
      const result = await extractReading(image);
      again = { ...testReadOf(result) };
      confidence = result.confidence;
    }
    const first = reportLines(report.kind, report.read, report.corrected);
    const now = reportLines(report.kind, again, report.corrected);
    return {
      confidence,
      lines: first.map((line, i) => ({ label: line.label, before: line.read, again: now[i]?.read ?? "?", corrected: line.corrected })),
    };
  } catch (error) {
    console.error(`[admin] read again: ${error instanceof Error ? error.message.slice(0, 160) : "failed"}`);
    return { error: "The scanner could not read it. Check the server logs." };
  }
}
