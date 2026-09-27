import { timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { pruneScanLog } from "@/lib/scan/quota";
import { runWeatherJob } from "@/lib/weather/job";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Nightly job, called by the Vercel cron (see vercel.json) with
 * `Authorization: Bearer <CRON_SECRET>`; refuses everything else. Refreshes the
 * weather for every active cell, then trims the photo-scan log to a year.
 */
function authorised(request: Request): boolean {
  const secret = serverEnv.cronSecret();
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (header.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}

export async function GET(request: Request) {
  if (!authorised(request)) {
    return Response.json({ ok: false, error: "unauthorised" }, { status: 401 });
  }
  const started = Date.now();
  try {
    const admin = createSupabaseAdminClient();
    const result = await runWeatherJob(admin);
    const scanLogPruned = await pruneScanLog(admin, new Date());
    return Response.json({ ok: result.failed === 0, ms: Date.now() - started, ...result, scanLogPruned });
  } catch (error) {
    return Response.json(
      { ok: false, ms: Date.now() - started, error: error instanceof Error ? error.message : "failed" },
      { status: 500 },
    );
  }
}
