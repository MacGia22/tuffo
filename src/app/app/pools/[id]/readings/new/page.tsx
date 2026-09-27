import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { serverEnv } from "@/lib/env";
import { monthlyUsed, resetLabel, scanLimits } from "@/lib/scan/quota";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Units } from "@/lib/format";
import { PoolCrumbs } from "@/components/pool-crumbs";
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

export default async function NewReadingPage({ params }: PageProps<"/app/pools/[id]/readings/new">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const supabase = await createSupabaseServerClient();
  const [{ data: pool }, { data: profile }] = await Promise.all([
    supabase.from("pools").select("id, name, sanitizer").eq("id", id).maybeSingle<{
      id: string;
      name: string;
      sanitizer: "chlorine" | "swg";
    }>(),
    supabase.from("profiles").select("units").maybeSingle<{ units: Units }>(),
  ]);
  if (!pool) notFound();

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
        poolId={pool.id}
        units={profile?.units ?? "us"}
        swg={pool.sanitizer === "swg"}
        scanEnabled={scanEnabled}
        scanAllowance={scanAllowance}
      />
    </>
  );
}
