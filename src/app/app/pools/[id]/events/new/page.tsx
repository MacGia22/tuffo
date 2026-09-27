import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PoolCrumbs } from "@/components/pool-crumbs";
import type { Units } from "@/lib/format";
import { isUuid } from "@/lib/form-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EventForm } from "./event-form";

export const metadata: Metadata = { title: "Log an event" };

export default async function NewEventPage({ params }: PageProps<"/app/pools/[id]/events/new">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const supabase = await createSupabaseServerClient();
  const [{ data: pool }, { data: profile }] = await Promise.all([
    supabase.from("pools").select("id, name").eq("id", id).maybeSingle<{ id: string; name: string }>(),
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
      <EventForm poolId={pool.id} units={profile?.units ?? "us"} />
    </>
  );
}
