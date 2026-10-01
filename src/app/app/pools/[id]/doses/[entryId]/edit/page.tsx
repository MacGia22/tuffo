import type { Metadata } from "next";
import { safeReturnTo } from "@/lib/return-to";
import { notFound } from "next/navigation";
import { PoolCrumbs } from "@/components/pool-crumbs";
import type { BaseUnit } from "@/lib/dose-format";
import { doseEditValues } from "@/lib/edit-values";
import type { Units } from "@/lib/format";
import { isUuid } from "@/lib/form-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DoseForm } from "../../new/dose-form";

export const metadata: Metadata = { title: "Edit a dose" };

export default async function EditDosePage({ params, searchParams }: PageProps<"/app/pools/[id]/doses/[entryId]/edit">) {
  const { id, entryId } = await params;
  const { from } = await searchParams;
  if (!isUuid(id) || !isUuid(entryId)) notFound();

  const supabase = await createSupabaseServerClient();
  const [{ data: pool }, { data: dose }, { data: profile }] = await Promise.all([
    supabase
      .from("pools")
      .select("id, name, timezone")
      .eq("id", id)
      .maybeSingle<{ id: string; name: string; timezone: string | null }>(),
    supabase
      .from("doses")
      .select("id, product_id, amount, unit, added_at, notes")
      .eq("id", entryId)
      .eq("pool_id", id)
      .maybeSingle<{ id: string; product_id: string; amount: number; unit: BaseUnit; added_at: string; notes: string | null }>(),
    supabase.from("profiles").select("units").maybeSingle<{ units: Units }>(),
  ]);
  if (!pool || !dose) notFound();
  const units = profile?.units ?? "us";
  const timeZone = pool.timezone ?? "UTC";

  return (
    <>
      <PoolCrumbs poolId={pool.id} poolName={pool.name} here="Edit a dose" />
      <div>
        <h1 className="text-3xl font-semibold">Edit a dose</h1>
        <p className="text-muted">Fix the product, the amount or the time.</p>
      </div>
      <DoseForm
        returnTo={safeReturnTo(from, `/app/pools/${id}`)}
        poolId={pool.id}
        units={units}
        prefill={{}}
        edit={{ id: dose.id, timeZone, values: doseEditValues(dose, units, timeZone) }}
      />
    </>
  );
}
