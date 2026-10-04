import type { Metadata } from "next";
import { safeReturnTo } from "@/lib/return-to";
import { notFound } from "next/navigation";
import { PoolCrumbs } from "@/components/pool-crumbs";
import type { Units } from "@/lib/format";
import { eventKindInfo } from "@/lib/events";
import { isUuid } from "@/lib/form-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EventForm } from "./event-form";
import { cellLevelCount } from "@/lib/salt-cells";

export const metadata: Metadata = { title: "Log an event" };

export default async function NewEventPage({ params, searchParams }: PageProps<"/app/pools/[id]/events/new">) {
  const { id } = await params;
  const { from } = await searchParams;
  const query = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  const kind = eventKindInfo(one(query.kind) ?? "")?.kind;
  const value = one(query.value);
  const prefill = kind ? { kind, value: value && /^\d{1,3}(\.5)?$/.test(value) ? value : undefined } : undefined;
  if (!isUuid(id)) notFound();

  const supabase = await createSupabaseServerClient();
  const [{ data: pool }, { data: profile }] = await Promise.all([
    supabase
      .from("pools")
      // "*": the cell's level count exists only once its migration has run.
      .select("*")
      .eq("id", id)
      .maybeSingle<{ id: string; name: string; sanitizer: "chlorine" | "swg"; swg_cell_model: string | null; swg_cell_levels?: number | null }>(),
    supabase.from("profiles").select("units").maybeSingle<{ units: Units }>(),
  ]);
  if (!pool) notFound();

  return (
    <>
      <PoolCrumbs poolId={pool.id} poolName={pool.name} here="Log an event" />
      <div>
        <h1 className="text-3xl font-semibold">Log an event</h1>
        <p className="text-muted">
          Refills, backwashes and busy days change the water between tests. Logging them helps Tuffo tell weather
          from everything else.
        </p>
      </div>
      <EventForm
        returnTo={safeReturnTo(from, `/app/pools/${id}`)}
        poolId={pool.id} units={profile?.units ?? "us"} swg={pool.sanitizer === "swg"} prefill={prefill}
        cellLevels={pool.sanitizer === "swg" ? cellLevelCount(pool.swg_cell_model, pool.swg_cell_levels) : null} />
    </>
  );
}
