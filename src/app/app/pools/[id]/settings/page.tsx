import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PoolCrumbs } from "@/components/pool-crumbs";
import { describeEquipment, EQUIPMENT_KINDS, KIND_LABELS, type EquipmentKind } from "@/lib/equipment";
import { litersToDisplayVolume, type Units } from "@/lib/format";
import { isUuid } from "@/lib/form-data";
import { fromParam } from "@/lib/return-to";
import { healthItems, installConflicts, nextTaskChip, type TaskEquipment } from "@/lib/maintenance";
import { loadPoolMaintenance } from "@/lib/maintenance-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cellLevelCount, cellRatedHours, DEFAULT_SALT_TARGET_PPM, poolSaltTarget, saltTargetText } from "@/lib/salt-cells";
import { AddEquipmentRow, BasicsForm, CellCard, DeletePoolForm, EnclosureForm, EquipmentCard, type CardFacts } from "./settings-forms";
import { isEnclosureKind } from "@/lib/enclosure";
import { headers } from "next/headers";
import { RegionProvider } from "@/components/region-context";
import { regionForCountry, regionForTimeZone } from "@/lib/region";
import { visitorCountry } from "@/lib/weather/place-order";

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
  swg_cell_installed_on: string | null;
  /** Present once the salt-target migration has run (the pool row is read with "*"). */
  salt_target_low_ppm?: number | null;
  salt_target_high_ppm?: number | null;
  swg_cell_levels?: number | null;
  timezone?: string | null;
}

export interface EquipmentRow {
  id: string;
  /** "cell" only for earlier salt cells; the current cell lives on the pool. */
  kind: EquipmentKind | "cell";
  model: string | null;
  details: Record<string, unknown>;
  installed_on: string;
  removed_on: string | null;
}

function day(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default async function PoolSettingsPage({ params, searchParams }: PageProps<"/app/pools/[id]/settings">) {
  const { id } = await params;
  // Just created: the page opens as the pool's set-up step.
  const isNew = (await searchParams).new === "1";
  if (!isUuid(id)) notFound();

  const supabase = await createSupabaseServerClient();
  const [{ data: pool }, { data: profile }, { data: equipment }, { data: enclosureRow, error: enclosureError }] = await Promise.all([
    supabase
      .from("pools")
      .select("*")
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
    // Read on its own: before its migration lands the columns are missing and the card is left out.
    supabase
      .from("pools")
      .select("enclosure, enclosure_sun_pct")
      .eq("id", id)
      .maybeSingle<{ enclosure: string | null; enclosure_sun_pct: number | null }>(),
  ]);
  if (!pool) notFound();
  const units = profile?.units ?? "us";
  const rows = equipment ?? [];
  const volume = Math.round(litersToDisplayVolume(Number(pool.volume_l), units));
  const earlier = rows.filter((r) => r.removed_on !== null);
  const settingsHref = `/app/pools/${pool.id}/settings`;
  const maintenanceHref = `/app/pools/${pool.id}/maintenance`;
  const pumpHref = `/app/pools/${pool.id}/pump?${fromParam(settingsHref)}`;
  const swg = pool.sanitizer === "swg";

  // Upkeep and life per piece of equipment; fails open (no chips or bars) before its migration.
  const upkeep = await loadPoolMaintenance(supabase, pool.id, { cellHours: true });
  const current = EQUIPMENT_KINDS.flatMap((kind) => {
    const row = rows.find((r) => r.kind === kind && r.removed_on === null);
    return row ? [{ kind, row }] : [];
  });
  const cellInstalledOn = pool.swg_cell_installed_on ?? null;
  const life = upkeep
    ? healthItems({
        today: upkeep.today,
        cell:
          swg && cellInstalledOn
            ? {
                installedOn: cellInstalledOn,
                hoursUsed: upkeep.cell?.hours?.hours ?? null,
                ratedHours: cellRatedHours(pool.swg_cell_model),
              }
            : null,
        equipment: current.map(({ kind, row }) => ({
          kind,
          type: typeof row.details?.type === "string" ? row.details.type : null,
          installedOn: row.installed_on,
          label: kind,
        })),
      })
    : [];
  const facts = (equipment: TaskEquipment, lifeLabel: string, since: string | null, links: CardFacts["links"]): CardFacts => {
    const item = life.find((l) => l.label === lifeLabel);
    // Upkeep logged before this item was installed, with no earlier item of the kind in place.
    const conflicts =
      upkeep && since
        ? installConflicts({
            equipment,
            installedOn: since,
            earlier: earlier
              .filter((r) => r.kind === equipment)
              .map((r) => ({ installedOn: r.installed_on, removedOn: r.removed_on as string })),
            history: upkeep.log,
          })
        : [];
    const first = conflicts[0];
    const hours = equipment === "pump" && upkeep?.pumpHours ? `, about ${upkeep.pumpHours.hours.toLocaleString("en-US")} hours run` : "";
    return {
      since: since ? day(since) : null,
      life: item ? { share: item.share, tone: item.tone, text: `${item.text}${hours}` } : null,
      chip: upkeep ? nextTaskChip(upkeep.statuses, equipment, upkeep.today) : null,
      links: [...links, { href: maintenanceHref, label: "Maintenance" }],
      warning: first
        ? `The log has "${first.task.label}" on ${day(first.doneOn)}${conflicts.length > 1 ? ` and ${conflicts.length - 1} more` : ""}, before this was installed. Fix the install date, or the log in Maintenance.`
        : null,
    };
  };
  const missing = EQUIPMENT_KINDS.filter((kind) => !current.some((c) => c.kind === kind));
  const cellLb = pool.swg_cell_lb_per_day === null ? null : Number(pool.swg_cell_lb_per_day);
  // The pool's region lists its own makers first; before a location, the visitor's country.
  const region =
    regionForTimeZone(pool.timezone) ?? regionForCountry(visitorCountry((await headers()).get("x-vercel-ip-country")));
  // The pool's own salt range, as typed in the cell form (not the listed cell's or the usual one).
  const ownSalt =
    pool.salt_target_low_ppm != null && pool.salt_target_high_ppm != null
      ? { low: Number(pool.salt_target_low_ppm), high: Number(pool.salt_target_high_ppm) }
      : null;

  return (
    <>
      <PoolCrumbs poolId={pool.id} poolName={pool.name} here="Settings" />
      {isNew ? (
        <section
          aria-label="Set up your pool"
          className="flex flex-col gap-3 rounded-2xl border border-lagoon/40 bg-lagoon/5 p-4"
        >
          <p className="font-semibold">{pool.name} is saved.</p>
          <p className="text-sm">
            Add the equipment you have so Tuffo can count what it does:{" "}
            {pool.sanitizer === "swg"
              ? "the salt cell, the pump and its schedule"
              : "the pump, and a chlorine feeder if you use one"}
            . Skip anything you don&apos;t know; you can add or change it later from the pool&apos;s Settings.
          </p>
          <Link
            href={`/app/pools/${pool.id}`}
            className="self-start rounded-xl bg-action px-4 py-2.5 text-sm font-semibold text-white hover:bg-action-deep"
          >
            Done, go to the pool
          </Link>
        </section>
      ) : null}
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">{isNew ? "Set up your pool" : "Pool settings"}</h1>
        <p className="text-muted">The pool, its location and equipment. Replaced items stay in the history.</p>
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
        {!enclosureError && enclosureRow ? (
          <EnclosureForm
            poolId={pool.id}
            current={{
              enclosure: isEnclosureKind(enclosureRow.enclosure) ? enclosureRow.enclosure : null,
              sunPct: enclosureRow.enclosure_sun_pct,
            }}
          />
        ) : null}
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
            href={`/app/pools/${pool.id}/location?${fromParam(`/app/pools/${pool.id}/settings`)}`}
            className="font-semibold text-lagoon underline-offset-2 hover:underline"
          >
            {pool.place_label ? "Change location" : "Set location"}
          </Link>
        </p>
      </section>

      <RegionProvider region={region}>
      <section aria-labelledby="equipment" className="flex flex-col gap-4">
        <h2 id="equipment" className="text-xl font-semibold">
          Equipment
        </h2>
        {swg ? (
          <CellCard
            poolId={pool.id}
            current={{ model: pool.swg_cell_model ?? null, lbPerDay: cellLb, saltTarget: ownSalt, levels: cellLevelCount(pool.swg_cell_model, pool.swg_cell_levels) }}
            installedOn={cellInstalledOn}
            summary={
              cellLb === null
                ? null
                : [
                    `${pool.swg_cell_model && pool.swg_cell_model !== "Other" ? pool.swg_cell_model : "Rated cell"}, ${cellLb} lb of chlorine a day at 100%`,
                    `salt ${saltTargetText(poolSaltTarget(pool) ?? DEFAULT_SALT_TARGET_PPM)}`,
                    cellLevelCount(pool.swg_cell_model, pool.swg_cell_levels) ? `set in levels 1–${pool.swg_cell_levels}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")
            }
            facts={facts("cell", "Salt cell", cellInstalledOn, [
              {
                href: `/app/pools/${pool.id}/events/new?kind=cell_setting&${fromParam(settingsHref)}`,
                label: "Cell setting",
              },
              { href: pumpHref, label: "Pump schedule" },
            ])}
          />
        ) : null}
        {current.map(({ kind, row }) => (
          <EquipmentCard
            key={row.id}
            poolId={pool.id}
            kind={kind}
            current={{
              model: row.model,
              details: row.details,
              since: day(row.installed_on),
              installedOn: row.installed_on,
              summary: describeEquipment(kind, row.model, row.details),
            }}
            facts={facts(kind, kind, row.installed_on, kind === "pump" ? [{ href: pumpHref, label: "Pump schedule" }] : [])}
          />
        ))}
        <AddEquipmentRow poolId={pool.id} kinds={missing} />
      </section>
      </RegionProvider>

      {isNew ? (
        <Link
          href={`/app/pools/${pool.id}`}
          className="self-start rounded-xl bg-action px-4 py-2.5 text-sm font-semibold text-white hover:bg-action-deep"
        >
          Done, go to the pool
        </Link>
      ) : null}

      {earlier.length > 0 ? (
        <section aria-labelledby="history" className="flex flex-col gap-2">
          <h2 id="history" className="text-xl font-semibold">
            Earlier equipment
          </h2>
          <ul className="flex flex-col gap-1 text-sm">
            {earlier.map((r) => (
              <li key={r.id}>
                {r.kind === "cell"
                  ? `Salt cell: ${r.model ?? "rated cell"}${typeof r.details?.lbPerDay === "number" ? `, ${r.details.lbPerDay} lb a day` : ""}`
                  : `${KIND_LABELS[r.kind]}: ${describeEquipment(r.kind, r.model, r.details)}`}{" "}
                ({day(r.installed_on)} to{" "}
                {day(r.removed_on as string)})
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="delete" className="flex flex-col gap-2">
        <h2 id="delete" className="text-xl font-semibold">
          Delete this pool
        </h2>
        <DeletePoolForm poolId={pool.id} name={pool.name} />
      </section>
    </>
  );
}
