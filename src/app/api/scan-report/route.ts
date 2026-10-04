import type { SupabaseClient } from "@supabase/supabase-js";
import { getCurrentUser } from "@/lib/auth/user";
import { scanModel, SCAN_PROMPT_VERSION } from "@/lib/scan/extract";
import { PUMP_PROMPT_VERSION } from "@/lib/scan/pump";
import {
  isJpeg,
  parseReport,
  photoDeleteAfter,
  REPORT_CONSENT_VERSION,
  REPORT_DAILY_LIMIT,
  REPORT_PHOTO_MAX_BYTES,
  reportPhotoPath,
} from "@/lib/scan/report";
import { reportsToday, SCAN_REPORT_BUCKET } from "@/lib/scan/report-store";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * POST multipart/form-data: `report` (JSON: kind, source, read, corrected, note,
 * photoConsent) and, only when the person ticked the box, `photo` (the cropped JPEG).
 * Signed-in users only, at most REPORT_DAILY_LIMIT a day. Writes one scan_reports row
 * and the photo at scan-reports/{user_id}/{report_id}.jpg with the service client.
 * Never touches the test or schedule being logged.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ ok: false, error: "Sign in first." }, { status: 401 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ ok: false, error: "Send the report as multipart form data." }, { status: 400 });
  }
  const parsed = parseReport(form.get("report"));
  if (!parsed.ok) return Response.json({ ok: false, error: parsed.error }, { status: 400 });
  const report = parsed.report;

  const photo = form.get("photo");
  let bytes: Uint8Array | null = null;
  if (photo !== null) {
    if (!(photo instanceof File)) return Response.json({ ok: false, error: "The photo could not be read." }, { status: 400 });
    if (!report.photoConsent) {
      return Response.json({ ok: false, error: "Tick the box to share the photo, or send without it." }, { status: 400 });
    }
    if (photo.size === 0 || photo.size > REPORT_PHOTO_MAX_BYTES) {
      return Response.json({ ok: false, error: "Photos up to 2 MB, please. Crop it a little more." }, { status: 413 });
    }
    bytes = new Uint8Array(await photo.arrayBuffer());
    if (!isJpeg(bytes)) return Response.json({ ok: false, error: "The photo must be a JPEG." }, { status: 415 });
  }

  let admin: SupabaseClient;
  try {
    admin = createSupabaseAdminClient();
  } catch {
    console.error("[scan-report] no service client");
    return Response.json({ ok: false, error: "Reports are not available right now. Try again later." }, { status: 503 });
  }

  const now = new Date();
  const sent = await reportsToday(admin, user.id, now);
  if (sent !== null && sent >= REPORT_DAILY_LIMIT) {
    return Response.json(
      { ok: false, error: `That is ${REPORT_DAILY_LIMIT} reports today, the most for one day. Thanks; try again tomorrow.` },
      { status: 429 },
    );
  }

  const id = crypto.randomUUID();
  const path = bytes ? reportPhotoPath(user.id, id) : null;
  const bucket = admin.storage.from(SCAN_REPORT_BUCKET);
  if (bytes && path) {
    const { error } = await bucket.upload(path, bytes, { contentType: "image/jpeg", upsert: false });
    if (error) {
      console.error(`[scan-report] upload: ${error.message.slice(0, 160)}`);
      return Response.json(
        { ok: false, error: "The photo could not be sent. Try again, or untick the box to send the report without it." },
        { status: 502 },
      );
    }
  }

  const { error } = await admin.from("scan_reports").insert({
    id,
    user_id: user.id,
    created_at: now.toISOString(),
    kind: report.kind,
    source: report.source,
    model: scanModel().slice(0, 80),
    prompt_version: report.kind === "pump" ? PUMP_PROMPT_VERSION : SCAN_PROMPT_VERSION,
    read: report.read,
    corrected: report.corrected,
    note: report.note,
    photo_path: path,
    photo_consent_at: path ? now.toISOString() : null,
    consent_version: path ? REPORT_CONSENT_VERSION : null,
    photo_delete_after: path ? photoDeleteAfter(now) : null,
  });
  if (error) {
    console.error(`[scan-report] insert: ${`${error.code ?? ""} ${error.message}`.trim().slice(0, 160)}`);
    // No row points at the file, so it must not stay.
    if (path) {
      const { error: removeError } = await bucket.remove([path]);
      if (removeError) console.error(`[scan-report] cleanup: ${removeError.message.slice(0, 160)}`);
    }
    return Response.json({ ok: false, error: "The report could not be sent. Try again in a minute." }, { status: 502 });
  }
  return Response.json({ ok: true, photo: Boolean(path) });
}
