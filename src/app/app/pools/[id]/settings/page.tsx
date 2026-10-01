import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PoolCrumbs } from "@/components/pool-crumbs";
import { SaltCellForm } from "@/components/salt-cell-form";
import { describeEquipment, EQUIPMENT_KINDS, KIND_LABELS, type EquipmentKind } from "@/lib/equipment";
import { litersToDisplayVolume, type Units } from "@/lib/format";
import { isUuid } from "@/lib/form-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BasicsForm, EquipmentCard } from "./settings-forms";

export const metadata: Metadata = { title: "Pool settings" };

interface PoolRow {
  id: string;
  name: string;
  volume_l: number | string;
  sanitizer: "chlorine" | "swg";
  surface: "plaster" | "vinyl" | "fiberglass";
  covered: boolean;
  place_label: string | null;
  swg_cell_lb_per_day: number | string | null;
  swg_cell_model: string | null;
}

export interface EquipmentRow {
  id: string;
  kind: EquipmentKind;
  model: string | null;
  details: Record<string, unknown>;
  installed_on: string;
  removed_on: string | null;
}

export default async function PoolSettingsPage({ params }: PageProps<"/app/pools/[id]/settings">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const supabase = await createSupabaseServerClient();
  const [{ data: pool }, { data: profile }, { data: equipment }] = await Promise.all([
    supabase
      .from("pools")
      .select("id, name, volume_l, sanitizer, surface, covered, place_label, swg_cell_lb_per_day, swg_cell_model")
      .eq("id", id)
      .maybeSingle<PoolRow>(),
    supabase.from("profiles").select("units").maybeSingle<{ units: Units }>(),
    // Before its migration lands the table is missing: the page shows empty equipment.
    supabase
      .from("pool_equipment")
      .select("id, kind, model, details, installed_on, removed_on")
      .eq("pool_id", id)
      .order("installed_on", { ascending: false })
      .limit(200)
      .returns<EquipmentRow[]>(),
  ]);
  if (!pool) notFound();
  const units = profile?.units ?? "us";
  const rows = equipment ?? [];
  const volume = Math.round(litersToDisplayVolume(Number(pool.volume_l), units));
  const earlier = rows.filter((r) => r.removed_on !== null);
  const day = (date: string) =>
    new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });

  return (
    <>
      <PoolCrumbs poolId={pool.id} poolName={pool.name} here="Settings" />
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">Pool settings</h1>
        <p className="text-muted">
          The pool and its equipment. When you replace a piece of equipment, Tuffo keeps the old one in the history with
          its dates, so it knows what was running between your tests.
        </p>
      </div>

      <section aria-labelledby="basics" className="flex flex-col gap-3">
        <h2 id="basics" className="text-xl font-semibold">
          The pool
        </h2>
        <BasicsForm
          poolId={pool.id}
          units={units}
          current={{
            name: pool.name,
            volume: String(volume),
            sanitizer: pool.sanitizer,
            surface: pool.surface,
            covered: pool.covered,
          }}
        />
      </section>

      <section aria-labelledby="where" className="flex flex-col gap-2">
        <h2 id="where" className="text-xl font-semibold">
          Location
        </h2>
        <p className="text-sm">
          {pool.place_label ? (
            <>
              Weather for <span className="font-semibold">{pool.place_label}</span>.{" "}
            </>
          ) : (
            "No location yet. "
          )}
          <Link
            href={`/app/pools/${pool.id}/location`}
            className="font-semibold text-lagoon underline-offset-2 hover:underline"
          >
            {pool.place_label ? "Change location" : "Set location"}
          </Link>
        </p>
      </section>

      <section aria-labelledby="equipment" className="flex flex-col gap-4">
        <h2 id="equipment" className="text-xl font-semibold">
          Equipment
        </h2>
        {pool.sanitizer === "swg" ? (
          <div className="flex flex-col gap-2">
            <h3 className="font-semibold">Salt cell</h3>
            <SaltCellForm
              poolId={pool.id}
              current={{
                model: pool.swg_cell_model ?? null,
                lbPerDay: pool.swg_cell_lb_per_day === null ? null : Number(pool.swg_cell_lb_per_day),
              }}
            />
            <p className="text-sm">
              <Link
                href={`/app/pools/${pool.id}/events/new?kind=cell_setting`}
                className="font-semibold text-lagoon underline-offset-2 hover:underline"
              >
                Log a cell setting change
              </Link>
            </p>
          </div>
        ) : null}
        {EQUIPMENT_KINDS.map((kind) => {
          const current = rows.find((r) => r.kind === kind && r.removed_on === null) ?? null;
          return (
            <EquipmentCard
              key={kind}
              poolId={pool.id}
              kind={kind}
              current={
                current
                  ? {
                      model: current.model,
                      details: current.details,
                      since: day(current.installed_on),
                      summary: describeEquipment(kind, current.model, current.details),
                    }
                  : null
              }
              scheduleHref={kind === "pump" ? `/app/pools/${pool.id}/pump` : null}
            />
          );
        })}
      </section>

      {earlier.length > 0 ? (
        <section aria-labelledby="history" className="flex flex-col gap-2">
          <h2 id="history" className="text-xl font-semibold">
            Earlier equipment
          </h2>
          <ul className="flex flex-col gap-1 text-sm">
            {earlier.map((r) => (
              <li key={r.id}>
                {KIND_LABELS[r.kind]}: {describeEquipment(r.kind, r.model, r.details)} ({day(r.installed_on)} to{" "}
                {day(r.removed_on as string)})
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
