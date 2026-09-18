import { timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { runWeatherJob } from "@/lib/weather/job";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Nightly weather refresh, called by the Vercel cron (see vercel.json) with
 * `Authorization: Bearer <CRON_SECRET>`. Refuses everything else.
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
    const result = await runWeatherJob(createSupabaseAdminClient());
    return Response.json({ ok: result.failed === 0, ms: Date.now() - started, ...result });
  } catch (error) {
    return Response.json(
      { ok: false, ms: Date.now() - started, error: error instanceof Error ? error.message : "failed" },
      { status: 500 },
    );
  }
}
