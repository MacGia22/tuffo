import { cronAuthorised } from "@/lib/auth/cron";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { recomputeAllModels } from "@/lib/model/recompute";
import { refreshAllPlans } from "@/lib/plan/build";
import { pruneScanLog } from "@/lib/scan/quota";
import { runWeatherJob } from "@/lib/weather/job";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Nightly job, called by the Vercel cron (see vercel.json) with
 * `Authorization: Bearer <CRON_SECRET>`; refuses everything else. Refreshes the
 * weather for every active cell, refits every pool's chlorine model on it, rebuilds each
 * pool's 7-day plan from the new forecast, then trims the photo-scan log to a year.
 */
export async function GET(request: Request) {
  if (!cronAuthorised(request)) {
    return Response.json({ ok: false, error: "unauthorised" }, { status: 401 });
  }
  const started = Date.now();
  try {
    const admin = createSupabaseAdminClient();
    const result = await runWeatherJob(admin);
    const models = await recomputeAllModels(admin);
    // After the forecast is stored and the models refitted.
    const plans = await refreshAllPlans(admin);
    const scanLogPruned = await pruneScanLog(admin, new Date());
    return Response.json({ ok: result.failed === 0, ms: Date.now() - started, ...result, models, plans, scanLogPruned });
  } catch (error) {
    return Response.json(
      { ok: false, ms: Date.now() - started, error: error instanceof Error ? error.message : "failed" },
      { status: 500 },
    );
  }
}
