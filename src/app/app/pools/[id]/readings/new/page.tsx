import type { Metadata } from "next";
import { safeReturnTo } from "@/lib/return-to";
import { notFound } from "next/navigation";
import { serverEnv } from "@/lib/env";
import { monthlyUsed, resetLabel, scanLimits } from "@/lib/scan/quota";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Units } from "@/lib/format";
import { PoolCrumbs } from "@/components/pool-crumbs";
import { lastValues, type PastReading } from "@/lib/reading-hints";
import { ReadingForm } from "./reading-form";

export const metadata: Metadata = { title: "Log a test" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** This month's scans left for the signed-in user; null hides the count (e.g. before the scans table exists). */
async function loadAllowance(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>) {
  const now = new Date();
  const used = await monthlyUsed(supabase, null, now);
  if (used === null) return null;
  const { monthly } = scanLimits();
  return { remaining: Math.max(0, monthly - used), limit: monthly, resetsOn: resetLabel(now) };
}

export default async function NewReadingPage({ params, searchParams }: PageProps<"/app/pools/[id]/readings/new">) {
  const { id } = await params;
  const { from } = await searchParams;
  if (!UUID.test(id)) notFound();

  const supabase = await createSupabaseServerClient();
  const [{ data: pool }, { data: profile }, { data: recent }] = await Promise.all([
    supabase.from("pools").select("id, name, sanitizer, timezone").eq("id", id).maybeSingle<{
      id: string;
      name: string;
      sanitizer: "chlorine" | "swg";
      timezone: string | null;
    }>(),
    supabase.from("profiles").select("units").maybeSingle<{ units: Units }>(),
    // The last value of each measure, shown under its field.
    supabase
      .from("readings")
      .select("taken_at, method, fc, cc, ph, ta, ch, cya, salt, borate, phosphate, water_temp_c")
      .eq("pool_id", id)
      .order("taken_at", { ascending: false })
      .limit(20)
      .returns<PastReading[]>(),
  ]);
  if (!pool) notFound();
  const units = profile?.units ?? "us";
  const last = lastValues(recent ?? [], units, pool.timezone ?? "UTC");

  const scanEnabled = Boolean(serverEnv.anthropicApiKey());
  const scanAllowance = scanEnabled ? await loadAllowance(supabase) : null;

  return (
    <>
      <PoolCrumbs poolId={pool.id} poolName={pool.name} here="Log a test" />
      <div>
        <h1 className="text-3xl font-semibold">Log a test</h1>
        <p className="text-muted">Fill in what you measured; leave the rest blank.</p>
      </div>
      <ReadingForm
        returnTo={safeReturnTo(from, `/app/pools/${id}`)}
        poolId={pool.id}
        units={units}
        swg={pool.sanitizer === "swg"}
        scanEnabled={scanEnabled}
        scanAllowance={scanAllowance}
        last={last.values}
        lastMethod={last.method}
      />
    </>
  );
}
