import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PoolCrumbs } from "@/components/pool-crumbs";
import type { Units } from "@/lib/format";
import { isUuid } from "@/lib/form-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ImportForm } from "./import-form";

export const metadata: Metadata = { title: "Import tests" };

export default async function ImportPage({ params }: PageProps<"/app/pools/[id]/import">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const supabase = await createSupabaseServerClient();
  const [{ data: pool }, { data: profile }] = await Promise.all([
    supabase
      .from("pools")
      .select("id, name, timezone")
      .eq("id", id)
      .maybeSingle<{ id: string; name: string; timezone: string | null }>(),
    supabase.from("profiles").select("units").maybeSingle<{ units: Units }>(),
  ]);
  if (!pool) notFound();

  return (
    <>
      <PoolCrumbs poolId={pool.id} poolName={pool.name} here="Import tests" />
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">Import tests</h1>
        <p className="text-muted">
          Bring in your history from Pool Math or any spreadsheet saved as CSV: one test per line, with a date column.
        </p>
        <p className="text-sm text-muted">
          In Pool Math: menu → Export/Import → Export All Test Logs (.csv). Its export holds tests only, so chemicals you
          added are not imported. Tests at the same minute as one already logged are skipped.
        </p>
      </div>
      <ImportForm poolId={pool.id} units={profile?.units ?? "us"} timeZone={pool.timezone ?? "UTC"} />
    </>
  );
}
