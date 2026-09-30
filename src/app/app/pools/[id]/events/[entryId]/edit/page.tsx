import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PoolCrumbs } from "@/components/pool-crumbs";
import { eventEditValues } from "@/lib/edit-values";
import type { Units } from "@/lib/format";
import { isUuid } from "@/lib/form-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EventForm } from "../../new/event-form";

export const metadata: Metadata = { title: "Edit an event" };

export default async function EditEventPage({ params }: PageProps<"/app/pools/[id]/events/[entryId]/edit">) {
  const { id, entryId } = await params;
  if (!isUuid(id) || !isUuid(entryId)) notFound();

  const supabase = await createSupabaseServerClient();
  const [{ data: pool }, { data: event }, { data: profile }] = await Promise.all([
    supabase
      .from("pools")
      .select("id, name, timezone")
      .eq("id", id)
      .maybeSingle<{ id: string; name: string; timezone: string | null }>(),
    supabase
      .from("events")
      .select("id, kind, value, occurred_at, notes")
      .eq("id", entryId)
      .eq("pool_id", id)
      .maybeSingle<{ id: string; kind: string; value: number | null; occurred_at: string; notes: string | null }>(),
    supabase.from("profiles").select("units").maybeSingle<{ units: Units }>(),
  ]);
  if (!pool || !event) notFound();
  const units = profile?.units ?? "us";
  const timeZone = pool.timezone ?? "UTC";

  return (
    <>
      <PoolCrumbs poolId={pool.id} poolName={pool.name} here="Edit an event" />
      <div>
        <h1 className="text-3xl font-semibold">Edit an event</h1>
        <p className="text-muted">Fix what happened or when.</p>
      </div>
      <EventForm poolId={pool.id} units={units} edit={{ id: event.id, timeZone, values: eventEditValues(event, units, timeZone) }} />
    </>
  );
}
