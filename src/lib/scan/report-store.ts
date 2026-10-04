import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Shared scan photos in the private "scan-reports" bucket, always with the service
 * client: there are no storage policies for users. People and the admin see a photo
 * through a signed URL that lasts five minutes. Every helper here logs and carries on
 * instead of throwing: a missing bucket or table must not break the page it is on.
 */

export const SCAN_REPORT_BUCKET = "scan-reports";
/** How long a signed photo URL works. */
export const PHOTO_URL_SECONDS = 300;

function log(what: string, error: unknown): void {
  const message =
    error && typeof error === "object" && "message" in error ? String((error as { message: unknown }).message) : String(error);
  console.error(`[scan-report] ${what}: ${message.slice(0, 160)}`);
}

/** Signed URLs for these photo paths; paths that fail are left out. */
export async function signedPhotoUrls(admin: SupabaseClient, paths: string[]): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  if (paths.length === 0) return urls;
  try {
    const { data, error } = await admin.storage.from(SCAN_REPORT_BUCKET).createSignedUrls(paths, PHOTO_URL_SECONDS);
    if (error) {
      log("signed urls", error);
      return urls;
    }
    for (const item of data ?? []) if (item.path && item.signedUrl && !item.error) urls.set(item.path, item.signedUrl);
  } catch (error) {
    log("signed urls", error);
  }
  return urls;
}

/**
 * Deletes these reports' photos from the bucket, then clears photo_path (the text
 * report stays). Rows whose files could not be removed keep their path, so a later run
 * tries again. Returns how many were cleared, or null when nothing could be done.
 */
export async function removeReportPhotos(
  admin: SupabaseClient,
  rows: { id: string; photo_path: string | null }[],
): Promise<number | null> {
  const withPhoto = rows.filter((r): r is { id: string; photo_path: string } => Boolean(r.photo_path));
  if (withPhoto.length === 0) return 0;
  try {
    const { error } = await admin.storage.from(SCAN_REPORT_BUCKET).remove(withPhoto.map((r) => r.photo_path));
    if (error) {
      log("remove photos", error);
      return null;
    }
    const { error: updateError } = await admin
      .from("scan_reports")
      .update({ photo_path: null })
      .in(
        "id",
        withPhoto.map((r) => r.id),
      );
    if (updateError) {
      log("clear photo paths", updateError);
      return null;
    }
    return withPhoto.length;
  } catch (error) {
    log("remove photos", error);
    return null;
  }
}

/**
 * Deletes every file under {userId}/ in the bucket, for account deletion: the rows
 * cascade from auth.users, the files do not. True when the folder is empty afterwards.
 */
export async function deleteUserReportFiles(admin: SupabaseClient, userId: string): Promise<boolean> {
  try {
    const bucket = admin.storage.from(SCAN_REPORT_BUCKET);
    // Each pass lists up to 100 names and removes them; stop when the folder is empty.
    for (let pass = 0; pass < 50; pass++) {
      const { data, error } = await bucket.list(userId, { limit: 100 });
      if (error) {
        // No bucket yet (migration not applied): nothing can be stored there either.
        if (/not found/i.test(error.message)) return true;
        log("list user files", error);
        return false;
      }
      const names = (data ?? []).map((f) => f.name).filter(Boolean);
      if (names.length === 0) return true;
      const { error: removeError } = await bucket.remove(names.map((name) => `${userId}/${name}`));
      if (removeError) {
        log("remove user files", removeError);
        return false;
      }
    }
    log("remove user files", "gave up after 5,000 files");
    return false;
  } catch (error) {
    log("remove user files", error);
    return false;
  }
}

/**
 * Retention: deletes shared photos whose photo_delete_after has come (UTC date), up to
 * 500 a run, and clears their paths. The daily alerts job calls it. Returns how many
 * were deleted, or null when it could not run.
 */
export async function pruneReportPhotos(admin: SupabaseClient, now: Date): Promise<number | null> {
  try {
    const today = now.toISOString().slice(0, 10);
    const { data, error } = await admin
      .from("scan_reports")
      .select("id, photo_path")
      .not("photo_path", "is", null)
      .lte("photo_delete_after", today)
      .limit(500)
      .returns<{ id: string; photo_path: string | null }[]>();
    if (error) {
      log("retention", error);
      return null;
    }
    return await removeReportPhotos(admin, data ?? []);
  } catch (error) {
    log("retention", error);
    return null;
  }
}

/** Reports this person sent since the start of today (UTC); null when the count fails. */
export async function reportsToday(admin: SupabaseClient, userId: string, now: Date): Promise<number | null> {
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  const { count, error } = await admin
    .from("scan_reports")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", since);
  if (error) {
    log("daily count", error);
    return null;
  }
  return count ?? 0;
}
