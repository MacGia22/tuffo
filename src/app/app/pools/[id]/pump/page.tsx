import type { Metadata } from "next";
import { safeReturnTo } from "@/lib/return-to";
import { notFound } from "next/navigation";
import { PoolCrumbs } from "@/components/pool-crumbs";
import { serverEnv } from "@/lib/env";
import { formatDay } from "@/lib/format";
import { isUuid } from "@/lib/form-data";
import type { PumpSegment } from "@/lib/pump";
import { monthlyUsed, resetLabel, scanLimits } from "@/lib/scan/quota";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { pumpScheduleUnit } from "@/lib/equipment";
import { PumpForm } from "./pump-form";

export const metadata: Metadata = { title: "Pump schedule" };

interface ScheduleRow {
  id: string;
  effective_from: string;
  segments: PumpSegment[];
  cell_hours: number | string;
}

export default async function PumpPage({ params, searchParams }: PageProps<"/app/pools/[id]/pump">) {
  const { id } = await params;
  const returnTo = safeReturnTo((await searchParams).from, `/app/pools/${id}`);
  if (!isUuid(id)) notFound();

  const supabase = await createSupabaseServerClient();
  const [{ data: pool }, { data: schedules }, { data: pump }] = await Promise.all([
    supabase
      .from("pools")
      .select("id, name, timezone")
      .eq("id", id)
      .maybeSingle<{ id: string; name: string; timezone: string | null }>(),
    supabase
      .from("pump_schedules")
      .select("id, effective_from, segments, cell_hours")
      .eq("pool_id", id)
      .order("effective_from", { ascending: false })
      .limit(20)
      .returns<ScheduleRow[]>(),
    // The pump from the pool's settings, for the unit its schedule is usually set in.
    supabase
      .from("pool_equipment")
      .select("details")
      .eq("pool_id", id)
      .eq("kind", "pump")
      .is("removed_on", null)
      .maybeSingle<{ details: unknown }>(),
  ]);
  if (!pool) notFound();
  const tz = pool.timezone ?? "UTC";

  const scanEnabled = Boolean(serverEnv.anthropicApiKey());
  let allowance = null;
  if (scanEnabled) {
    const now = new Date();
    const used = await monthlyUsed(supabase, null, now);
    if (used !== null) {
      const { monthly } = scanLimits();
      allowance = { remaining: Math.max(0, monthly - used), limit: monthly, resetsOn: resetLabel(now) };
    }
  }
  const history = schedules ?? [];

  return (
    <>
      <PoolCrumbs poolId={pool.id} poolName={pool.name} here="Pump schedule" />
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">Pump schedule</h1>
        <p className="text-muted">
          A salt cell only makes chlorine while water flows through it, so its daily output depends on how long the pump
          runs. With the schedule and the cell setting, Tuffo counts what the cell made between tests.
        </p>
      </div>
      <PumpForm
        returnTo={returnTo}
        poolId={pool.id}
        timeZone={tz}
        current={history[0]?.segments ?? null}
        scanEnabled={scanEnabled}
        allowance={allowance}
        defaultUnit={pumpScheduleUnit(pump?.details) ?? "rpm"}
      />
      {history.length > 0 ? (
        <section aria-labelledby="pump-history" className="flex flex-col gap-2">
          <h2 id="pump-history" className="text-xl font-semibold">
            Earlier schedules
          </h2>
          <ul className="flex flex-col gap-1 text-sm">
            {history.map((s) => (
              <li key={s.id}>
                From {formatDay(s.effective_from, tz)}: cell {Number(s.cell_hours)} h a day (
                {s.segments
                  .map((seg) => `${seg.start}–${seg.end}${seg.speed ? ` at ${seg.speed} ${seg.unit === "gpm" ? "GPM" : "RPM"}` : ""}${seg.cell ? "" : ", cell off"}`)
                  .join("; ")})
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
