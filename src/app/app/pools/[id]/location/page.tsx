import type { Metadata } from "next";
import { safeReturnTo } from "@/lib/return-to";
import { notFound } from "next/navigation";
import { PoolCrumbs } from "@/components/pool-crumbs";
import { isUuid } from "@/lib/form-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cellFor } from "@/lib/weather/cells";
import { LocationForm } from "./location-form";

export const metadata: Metadata = { title: "Weather location" };

/** True when the pool's cell is on the current grid (a cell of its own center). */
function onCurrentGrid(cellId: string | null): boolean {
  if (!cellId) return false;
  const [lat, lon] = cellId.split(",").map(Number);
  try {
    return cellFor(lat, lon).id === cellId;
  } catch {
    return false;
  }
}

export default async function LocationPage({ params, searchParams }: PageProps<"/app/pools/[id]/location">) {
  const { id } = await params;
  const returnTo = safeReturnTo((await searchParams).from, `/app/pools/${id}`);
  if (!isUuid(id)) notFound();

  const supabase = await createSupabaseServerClient();
  const { data: pool } = await supabase
    .from("pools")
    .select("id, name, place_label, cell_id, timezone")
    .eq("id", id)
    .maybeSingle<{ id: string; name: string; place_label: string | null; cell_id: string | null; timezone: string | null }>();
  if (!pool) notFound();
  const finer = onCurrentGrid(pool.cell_id);
  // The pool's current square as the starting point, so the owner can pick a neighbor
  // on the map without searching again.
  const [cellLat, cellLon] = (pool.cell_id ?? "").split(",").map(Number);
  const current =
    pool.place_label && pool.timezone && Number.isFinite(cellLat) && Number.isFinite(cellLon)
      ? { label: pool.place_label, timezone: pool.timezone, lat: cellLat, lon: cellLon, country: "" }
      : null;

  return (
    <>
      <PoolCrumbs poolId={pool.id} poolName={pool.name} here="Weather location" />
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">Weather location</h1>
        <p className="text-muted">
          Tuffo uses the weather for a square about 3 km (2 miles) across. Search your town or ZIP code, then tap the
          square your pool is in. Tuffo keeps only that square and the town name, never an address or the point you
          tap.
        </p>
        {pool.place_label ? (
          <p className="text-sm">
            Now: <span className="font-semibold">{pool.place_label}</span>
            {finer ? "" : " (on the older 5 km grid; save a square below to use the finer one)"}.
          </p>
        ) : null}
      </div>
      <LocationForm returnTo={returnTo} poolId={pool.id} current={current} />
    </>
  );
}
