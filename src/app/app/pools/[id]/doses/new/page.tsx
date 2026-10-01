import type { Metadata } from "next";
import { safeReturnTo } from "@/lib/return-to";
import { notFound } from "next/navigation";
import { PoolCrumbs } from "@/components/pool-crumbs";
import { catalogProduct } from "@/lib/catalog";
import { isShelfUnit, shelfToBase, baseUnitFor } from "@/lib/dose-format";
import type { Units } from "@/lib/format";
import { isUuid } from "@/lib/form-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DoseForm, type DosePrefill } from "./dose-form";

export const metadata: Metadata = { title: "Log a dose" };

function one(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** Only well-formed values from the "Log it" links make it into the form. */
function prefillFrom(params: Record<string, string | string[] | undefined>): DosePrefill {
  const product = catalogProduct(one(params.product) ?? "");
  if (!product) return {};
  const prefill: DosePrefill = { product: product.id };
  const unit = one(params.unit) ?? "";
  const amount = Number(one(params.amount));
  if (isShelfUnit(unit) && shelfToBase(1, unit).unit === baseUnitFor(product.form)) {
    prefill.unit = unit;
    if (Number.isFinite(amount) && amount > 0) prefill.amount = String(amount);
  }
  return prefill;
}

export default async function NewDosePage({ params, searchParams }: PageProps<"/app/pools/[id]/doses/new">) {
  const { id } = await params;
  const { from } = await searchParams;
  if (!isUuid(id)) notFound();

  const supabase = await createSupabaseServerClient();
  const [{ data: pool }, { data: profile }] = await Promise.all([
    supabase.from("pools").select("id, name").eq("id", id).maybeSingle<{ id: string; name: string }>(),
    supabase.from("profiles").select("units").maybeSingle<{ units: Units }>(),
  ]);
  if (!pool) notFound();
  const prefill = prefillFrom(await searchParams);

  return (
    <>
      <PoolCrumbs poolId={pool.id} poolName={pool.name} here="Log a dose" />
      <div>
        <h1 className="text-3xl font-semibold">Log a dose</h1>
        <p className="text-muted">
          What went into the water and how much. Tuffo counts it when it works out how much chlorine your pool uses.
        </p>
      </div>
      <DoseForm
        returnTo={safeReturnTo(from, `/app/pools/${id}`)}
        poolId={pool.id} units={profile?.units ?? "us"} prefill={prefill} />
    </>
  );
}
