import { runAlertsJob } from "@/lib/alerts/job";
import { cronAuthorised } from "@/lib/auth/cron";
import { pruneReportPhotos } from "@/lib/scan/report-store";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily alert emails, called by the second Vercel cron (see vercel.json, about 11:30 UTC,
 * morning in the US) with `Authorization: Bearer <CRON_SECRET>`. Sends only in
 * production; see src/lib/alerts/job.ts. Also deletes shared scan photos past their
 * 12 months (production only; Hobby allows no more crons). That step logs and carries on.
 */
export async function GET(request: Request) {
  if (!cronAuthorised(request)) return Response.json({ ok: false, error: "unauthorised" }, { status: 401 });
  const started = Date.now();
  try {
    const admin = createSupabaseAdminClient();
    // Before the emails, so a failure there cannot skip it. Null: did not run or failed (logged).
    const reportPhotosDeleted = process.env.VERCEL_ENV === "production" ? await pruneReportPhotos(admin, new Date()) : null;
    const result = await runAlertsJob(admin);
    return Response.json({ ok: result.failed === 0, ms: Date.now() - started, ...result, reportPhotosDeleted });
  } catch (error) {
    console.error(`[alerts] ${error instanceof Error ? error.message : String(error)}`);
    return Response.json({ ok: false, ms: Date.now() - started, error: "failed" }, { status: 500 });
  }
}
