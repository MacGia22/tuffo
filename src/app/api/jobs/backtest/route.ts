import { DEFAULT_PRIOR } from "@/engine/server";
import { cronAuthorised } from "@/lib/auth/cron";
import { backtestPool, median, summarizeBacktest, type BacktestPoint } from "@/lib/model/backtest";
import { loadPoolLog } from "@/lib/model/recompute";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Walk-forward backtest of the chlorine model on every pool (roadmap 2.3, launch gate:
 * median next-test error of 1.0 ppm or less on pools with 4+ pairs). Same bearer token
 * as the cron jobs; scripts/backtest.mjs prints the result. Returns error statistics
 * only: pools are numbered, never named or identified.
 */
export async function GET(request: Request) {
  if (!cronAuthorised(request)) {
    return Response.json({ ok: false, error: "unauthorised" }, { status: 401 });
  }
  const admin = createSupabaseAdminClient();
  const { data: pools, error } = await admin.from("pools").select("id").returns<{ id: string }[]>();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  const all: BacktestPoint[] = [];
  const perPool: { pool: number; pairs: number; usable: number; predictions: number; medianError: number | null }[] = [];
  let index = 0;
  for (const { id } of pools ?? []) {
    const log = await loadPoolLog(admin, id);
    if (!log || log.pairs.length === 0) continue;
    index += 1;
    const points = backtestPool(log.pairs, DEFAULT_PRIOR);
    all.push(...points);
    const counted = points.filter((p) => p.pairsBefore >= 4);
    perPool.push({
      pool: index,
      pairs: log.pairs.length,
      usable: log.pairs.filter((p) => p.skip === null && p.drivers !== null).length,
      predictions: counted.length,
      medianError: median(counted.map((p) => p.error)),
    });
  }

  return Response.json({ ok: true, summary: summarizeBacktest(all), pools: perPool });
}
