import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PoolCrumbs } from "@/components/pool-crumbs";
import { readingEditValues, type EditableReading } from "@/lib/edit-values";
import type { Units } from "@/lib/format";
import { isUuid } from "@/lib/form-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ReadingForm } from "../../new/reading-form";

export const metadata: Metadata = { title: "Edit a test" };

export default async function EditReadingPage({ params }: PageProps<"/app/pools/[id]/readings/[entryId]/edit">) {
  const { id, entryId } = await params;
  if (!isUuid(id) || !isUuid(entryId)) notFound();

  const supabase = await createSupabaseServerClient();
  const [{ data: pool }, { data: reading }, { data: profile }] = await Promise.all([
    supabase.from("pools").select("id, name, sanitizer, timezone").eq("id", id).maybeSingle<{
      id: string;
      name: string;
      sanitizer: "chlorine" | "swg";
      timezone: string | null;
    }>(),
    supabase
      .from("readings")
      .select("id, taken_at, fc, cc, ph, ta, ch, cya, salt, borate, phosphate, water_temp_c, method, notes")
      .eq("id", entryId)
      .eq("pool_id", id)
      .maybeSingle<EditableReading & { id: string }>(),
    supabase.from("profiles").select("units").maybeSingle<{ units: Units }>(),
  ]);
  if (!pool || !reading) notFound();
  const units = profile?.units ?? "us";
  const timeZone = pool.timezone ?? "UTC";

  return (
    <>
      <PoolCrumbs poolId={pool.id} poolName={pool.name} here="Edit a test" />
      <div>
        <h1 className="text-3xl font-semibold">Edit a test</h1>
        <p className="text-muted">Change what was measured or when; clear a field to remove that result.</p>
      </div>
      <ReadingForm
        poolId={pool.id}
        units={units}
        swg={pool.sanitizer === "swg"}
        scanEnabled={false}
        scanAllowance={null}
        edit={{ id: reading.id, timeZone, values: readingEditValues(reading, units, timeZone) }}
      />
    </>
  );
}
