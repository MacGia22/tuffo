import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PLAN_MAX_ADDITION_PPM, PLAN_OWN_MODEL_PAIRS } from "@/engine/server";
import { ActivityList } from "@/components/activity-list";
import { ChlorineUse } from "@/components/chlorine-use";
import { ChevronDownIcon, GearIcon, PlusIcon } from "@/components/icons";
import { MenuButton } from "@/components/log-menu";
import { HealthRow } from "@/components/maintenance-visuals";
import { SaltCellForm } from "@/components/salt-cell-form";
import { SetupChecklist } from "@/components/setup-checklist";
import { TestHistory } from "@/components/test-history";
import { NextSevenDays, TestStatusCard, TrendsLink, WhatToDoNow } from "@/components/today-sections";
import { WarmOffline } from "@/components/warm-offline";
import { WaterNow } from "@/components/water-now";
import { catalogProduct } from "@/lib/catalog";
import { baseToShelf, formatShelf } from "@/lib/dose-format";
import { KIND_LABELS } from "@/lib/equipment";
import { feedbackHref } from "@/lib/feedback";
import { formatDateTime, formatTemperature, formatVolume, methodLabel } from "@/lib/format";
import { isUuid } from "@/lib/form-data";
import { logLinks } from "@/lib/log-links";
import { dueParts, dueTasks, healthItems } from "@/lib/maintenance";
import { loadPoolMaintenance } from "@/lib/maintenance-data";
import { planAddLabel } from "@/lib/plan/add-label";
import { bandAdvice } from "@/lib/plan/band";
import { cellPercentOn, confidenceText, planHasFcLine } from "@/lib/plan/stored";
import { fromParam } from "@/lib/return-to";
import { cellLevels, cellRatedHours } from "@/lib/salt-cells";
import { setupSteps } from "@/lib/setup";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { historyCells, TILE_LABELS, waterLine, waterTiles, type TileKey } from "@/lib/tiles";
import { retestsDue, testStatus, todayActions, weekCards, type AdviceAction } from "@/lib/today";
import { localDateRange } from "@/lib/weather/summary";
import { DoneForm } from "./maintenance/maintenance-forms";
import { loadPoolView } from "./pool-view";

export async function generateMetadata({ params }: PageProps<"/app/pools/[id]">): Promise<Metadata> {
  const { id } = await params;
  if (!isUuid(id)) return { title: "Pool" };
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("pools").select("name").eq("id", id).maybeSingle<{ name: string }>();
  return { title: data?.name ?? "Pool" };
}

/** Slow measures: tested monthly, short names for the day cards. */
const SLOW: { key: TileKey; short: string }[] = [
  { key: "cya", short: "CYA" },
  { key: "ch", short: "CH" },
  { key: "ta", short: "TA" },
  { key: "salt", short: "salt" },
];

/**
 * A pool's Today page: the last test, the water now, what to do now, the next 7 days and
 * a link to the trends; then the salt cell, equipment health, chlorine use, activity and
 * the test history.
 */
export default async function PoolPage({ params }: PageProps<"/app/pools/[id]">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { pool, units, tz, liters, allReadings, allDoses, forecastDays, latest, advice, use, activity, plan, planMissesChlorine, today, saltStatus, now } =
    await loadPoolView(id, "2w", { trend: false });
  const swg = pool.sanitizer === "swg";
  const base = `/app/pools/${pool.id}`;
  const here = fromParam(base);

  // Upkeep due now or within days; fails open (nothing shown).
  const supabase = await createSupabaseServerClient();
  const upkeep = await loadPoolMaintenance(supabase, pool.id, { cellHours: true });
  const upkeepDue = upkeep ? dueTasks(upkeep.statuses) : [];
  const { data: alertRow } = await supabase
    .from("alert_settings")
    .select("*")
    .eq("pool_id", pool.id)
    .maybeSingle<Record<string, unknown>>();
  const setup = setupSteps({
    poolId: pool.id,
    swg,
    hasLocation: Boolean(pool.cell_id),
    hasTest: allReadings.length > 0,
    hasEquipment: (upkeep?.equipment.length ?? 0) > 0,
    hasFilter: Boolean(upkeep?.equipment.some((e) => e.kind === "filter")),
    cellInstalled: Boolean(upkeep?.cell?.installedOn),
    hasCleanPressure: Boolean(upkeep?.pressure?.clean),
    hasPumpSchedule: saltStatus?.cellHours !== null && saltStatus?.cellHours !== undefined,
    alertsOn: Boolean(alertRow && ["algae", "test_reminder", "weekly", "maintenance"].some((k) => alertRow[k] === true)),
  });
  const health = upkeep
    ? healthItems({
        today: upkeep.today,
        cell: upkeep.cell
          ? { installedOn: upkeep.cell.installedOn, hoursUsed: upkeep.cell.hours?.hours ?? null, ratedHours: cellRatedHours(upkeep.cell.model) }
          : null,
        equipment: upkeep.equipment.map((e) => ({ kind: e.kind, type: e.type, installedOn: e.installedOn, label: KIND_LABELS[e.kind] })),
      })
    : [];

  // Targets: the pool's (from the advice), or typical ones before a full test.
  const t = advice?.targets;
  const tileTargets = {
    fc: t ? { low: t.fc.targetLow, high: t.fc.targetHigh } : { low: 3, high: 5 },
    ph: t ? { low: t.ph.low, high: t.ph.high } : { low: 7.2, high: 7.8 },
    ta: t?.ta ?? { low: 60, high: 90 },
    ch: t?.ch ?? { low: 250, high: 450 },
    cya: t?.cya ?? { low: 30, high: 50 },
    salt: t?.salt,
  };

  // What the latest test says, as actions: a dose becomes "Add 1 qt of …" with its log link.
  const adviceActions: AdviceAction[] = (advice?.items ?? []).map((item) => {
    let dose: AdviceAction["dose"] = null;
    if (item.dose && item.dose.amount > 0) {
      const shelf = baseToShelf(item.dose.amount, item.dose.unit, units);
      if (shelf.value > 0) {
        const amount = formatShelf(shelf.value, shelf.unit);
        dose = {
          text: `${amount} of ${catalogProduct(item.dose.productId)?.short ?? item.dose.productId}`,
          amount,
          href: `${base}/doses/new?${new URLSearchParams({ product: item.dose.productId, amount: String(shelf.value), unit: shelf.unit })}&${here}`,
          notes: item.dose.notes,
        };
      }
    }
    return { measure: item.measure, severity: item.severity, title: item.title, detail: item.detail, dose };
  });
  const fcDose = adviceActions.find((a) => a.measure === "fc" && a.severity === "act" && a.dose)?.dose;

  // Water now: each measure from its newest test.
  const tiles = waterTiles({
    readings: allReadings,
    targets: tileTargets,
    fcMin: t?.fc.min ?? 2,
    fcSlam: t?.fc.slam ?? 10,
    swg,
    doses: allDoses.map((d) => {
      const shelf = baseToShelf(Number(d.amount), d.unit, units);
      return {
        productId: d.product_id,
        group: catalogProduct(d.product_id)?.group,
        addedAt: d.added_at,
        amountText: shelf.value > 0 ? formatShelf(shelf.value, shelf.unit) : "A little",
      };
    }),
    fcAction: fcDose ? `Add ${fcDose.text} now` : null,
    now,
    timeZone: tz,
  });
  // The same saturation index as the advice card (pH, TA, CH, CYA, borates, salt and the
  // water temperature); shown here only when the temperature was measured.
  const csi = advice?.csi && !advice.csi.assumedTemp ? { value: advice.csi.value, verdict: advice.csi.verdict } : null;
  const line = latest
    ? waterLine({
        temp: latest.water_temp_c === null ? null : formatTemperature(Number(latest.water_temp_c), units),
        cc: latest.cc === null ? null : Number(latest.cc),
        csi,
      })
    : null;

  // Retests of the slow measures, for the actions and the day cards.
  const slow = SLOW.filter((m) => m.key !== "salt" || swg);
  const lastTested = slow.map((m) => {
    const r = allReadings.find((x) => x[m.key] !== null);
    return { key: m.key, label: TILE_LABELS[m.key], testedOn: r ? localDateRange(r.taken_at, r.taken_at, tz).to : null };
  });
  const retests = latest ? retestsDue(lastTested, today) : [];
  const testsByDate: Record<string, string[]> = {};
  for (const r of retests) {
    const day = r.dueOn < today ? today : r.dueOn;
    (testsByDate[day] ??= []).push(slow.find((m) => m.key === r.key)?.short ?? r.label);
  }

  // Today's plan step and whether the week leaves the target band.
  const levels = swg ? cellLevels(pool.swg_cell_model) : null;
  const planToday = plan?.days.find((d) => d.date === today) ?? null;
  const cellNow = plan && swg ? cellPercentOn(plan.summary, today) : null;
  // Chlorine logged since the plan was built is not in it yet: no second "Add" today.
  const addToday = planToday && !swg && !planMissesChlorine ? planAddLabel(planToday, units) : null;
  const addShelf = planToday ? baseToShelf(planToday.addMl, "mL", units) : null;
  const product = plan ? catalogProduct(plan.summary.product) : undefined;
  const actions = todayActions({
    today,
    advice: adviceActions,
    plan:
      plan && swg && cellNow !== null
        ? {
            kind: "cell",
            percent: cellNow,
            logged: saltStatus?.setting ?? null,
            href: `${base}/events/new?kind=cell_setting&value=${cellNow}&${here}`,
            needPpm: plan.summary.swgNeedPpm,
            cellHours: plan.summary.cellHours ?? null,
          }
        : plan && addToday && addShelf
          ? {
              kind: "add",
              text: `${addToday} of ${product?.short ?? "liquid chlorine"}`,
              amount: addToday,
              href: `${base}/doses/new?${new URLSearchParams({ product: plan.summary.product, amount: String(addShelf.value), unit: addShelf.unit })}&${here}`,
              floor: plan.summary.floor,
              target: `${plan.summary.fc.targetLow}–${plan.summary.fc.targetHigh} ppm`,
            }
          : null,
    band: plan ? bandAdvice(plan, today, levels) : null,
    retests,
    maintenance: upkeepDue.map((s) => ({
      id: s.task.id,
      label: s.task.label,
      daysLeft: s.daysLeft,
      nextDue: s.nextDue,
      relative: dueParts(s, upkeep?.today ?? today).relative,
      pressureHigh: s.pressureHigh,
    })),
  });
  const taskForms = Object.fromEntries(
    upkeepDue.map((s) => [s.task.id, <DoneForm key={s.task.id} poolId={pool.id} task={s.task.id} taskLabel={s.task.label} />]),
  );

  const cards = weekCards({
    today,
    units,
    forecast: forecastDays,
    plan: plan
      ? {
          kind: plan.summary.kind,
          loggedPercent: saltStatus?.setting ?? null,
          days: plan.days.map((d) => ({
            date: d.date,
            // A salt pool's plan without the cell's output has no meaningful FC line.
            fcEnd: planHasFcLine(plan.summary) ? d.fcEnd : null,
            algaeRisk: d.algaeRisk,
            add: d.date === today && planMissesChlorine ? null : planAddLabel(d, units),
            cellPercent: swg ? cellPercentOn(plan.summary, d.date) : null,
          })),
        }
      : null,
    tests: testsByDate,
  });

  const subtitle = [formatVolume(liters, units), swg ? "salt cell" : "chlorine", pool.covered ? "covered" : null, pool.place_label]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <WarmOffline urls={["/app", ...["readings", "doses", "events"].map((kind) => `${base}/${kind}/new`)]} />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1">
            <h1 className="font-display text-[28px] font-semibold leading-tight">{pool.name}</h1>
            <Link
              href={`${base}/settings`}
              aria-label={`Settings for ${pool.name}`}
              title="Settings"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-lagoon/10 hover:text-foreground"
            >
              <GearIcon className="h-6 w-6" />
            </Link>
          </div>
          <p className="text-muted">{subtitle}</p>
        </div>
        {/* Phones log from the bar at the bottom; wider screens from here. */}
        <div className="hidden md:block">
          <MenuButton
            label="Log"
            placement="below-end"
            items={[
              ...logLinks(pool.id, base),
              { href: `${base}/import`, label: "Import CSV" },
              { href: feedbackHref(base), label: "Send feedback" },
            ]}
            buttonClassName="flex min-h-11 items-center gap-1.5 rounded-xl border border-border bg-surface px-4 text-sm font-semibold hover:border-lagoon"
          >
            <PlusIcon className="h-5 w-5 text-lagoon" />
            Log
            <ChevronDownIcon className="h-4 w-4" />
          </MenuButton>
        </div>
      </div>

      {latest ? (
        <TestStatusCard status={testStatus(latest.taken_at, methodLabel(latest.method), now, tz)} logHref={`${base}/readings/new?${here}`} />
      ) : (
        <section className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-border p-8">
          <h2 className="text-xl font-semibold">No tests logged yet</h2>
          <p className="max-w-lg text-muted">
            Log your first water test. From the second one on, Tuffo can show what the weather did in between and what to
            add next.
          </p>
          <Link
            href={`${base}/readings/new`}
            className="inline-flex min-h-11 items-center rounded-xl bg-action px-4 text-sm font-semibold text-white hover:bg-action-deep"
          >
            Log the first test
          </Link>
          <Link href={`${base}/import`} className="inline-flex min-h-11 items-center text-sm font-semibold text-lagoon">
            Or import your history from Pool Math (CSV)
          </Link>
        </section>
      )}

      <SetupChecklist poolId={pool.id} steps={setup} />

      {latest ? <WhatToDoNow actions={actions} assumptions={advice?.assumptions ?? []} taskForms={taskForms} /> : null}

      {cards.length > 0 ? (
        <NextSevenDays cards={cards}>
          {plan ? (
            <div className="flex flex-col gap-1 text-xs text-muted">
              {plan.summary.capped ? (
                <p className="font-semibold text-foreground">
                  {swg
                    ? "Even at 100% the cell may not keep up this week; top up with liquid chlorine if a test is low."
                    : `The plan stops at ${PLAN_MAX_ADDITION_PPM} ppm in one addition; test and add more if free chlorine is low.`}
                </p>
              ) : null}
              <details>
                <summary className="cursor-pointer font-semibold text-lagoon">How this plan works</summary>
                <ul className="mt-1 flex flex-col gap-1">
                  <li>{confidenceText(plan.summary, PLAN_OWN_MODEL_PAIRS)}</li>
                  <li>
                    It keeps free chlorine at {plan.summary.floor.toFixed(1)} ppm or more at the end of each day (target{" "}
                    {plan.summary.fc.targetLow}–{plan.summary.fc.targetHigh} ppm, never below {plan.summary.fc.min} ppm).
                    {!swg && product ? ` Amounts are ${product.name.toLowerCase()}.` : ""}
                  </li>
                  <li>UV is the day&apos;s peak index; rain is the forecast amount and its chance.</li>
                </ul>
              </details>
            </div>
          ) : null}
        </NextSevenDays>
      ) : null}

      {latest ? <WaterNow tiles={tiles} line={line} /> : null}

      {latest || pool.cell_id ? <TrendsLink href={`${base}/trends`} /> : null}

      {swg ? (
        <section id="salt-cell" aria-labelledby="salt-cell-title" className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4 text-sm">
          <h2 id="salt-cell-title" className="text-lg font-semibold">
            Salt cell
          </h2>
          {saltStatus ? (
            <>
              <p>
                Setting: <strong>{saltStatus.setting === null ? "not logged yet" : `${saltStatus.setting}%`}</strong>
                {saltStatus.settingSince ? ` since ${saltStatus.settingSince}` : ""} ·{" "}
                <Link href={`${base}/events/new?kind=cell_setting&${here}`} className="inline-flex min-h-11 items-center font-semibold text-lagoon">
                  Log a change
                </Link>
              </p>
              <p>
                Pump:{" "}
                {saltStatus.cellHours === null ? (
                  <strong>schedule not set</strong>
                ) : (
                  <>
                    the cell runs <strong>{saltStatus.cellHours} h</strong> a day
                  </>
                )}{" "}
                ·{" "}
                <Link href={`${base}/pump`} className="inline-flex min-h-11 items-center font-semibold text-lagoon">
                  {saltStatus.cellHours === null ? "Add the schedule" : "Change"}
                </Link>
              </p>
              {saltStatus.setting === null || saltStatus.cellHours === null ? (
                <p className="text-xs text-muted">
                  Until both are known, Tuffo leaves this pool&apos;s tests out of its chlorine model rather than guess what
                  the cell made.
                </p>
              ) : null}
            </>
          ) : null}
          <SaltCellForm
            poolId={pool.id}
            current={{
              model: pool.swg_cell_model ?? null,
              lbPerDay: pool.swg_cell_lb_per_day === null ? null : Number(pool.swg_cell_lb_per_day),
            }}
          />
        </section>
      ) : null}

      <HealthRow items={health} href={`${base}/maintenance#life`} />

      {use ? <ChlorineUse use={use} units={units} swg={swg} /> : null}

      {activity.length > 0 ? <ActivityList poolId={pool.id} items={activity} /> : null}

      {allReadings.length > 0 ? (
        <TestHistory
          poolId={pool.id}
          back={fromParam(`${base}#history`)}
          rows={allReadings.slice(0, 30).map((r) => ({
            id: r.id,
            when: formatDateTime(r.taken_at, tz),
            cells: historyCells(r, tileTargets),
            temp: r.water_temp_c === null ? null : formatTemperature(Number(r.water_temp_c), units),
          }))}
        />
      ) : null}
    </>
  );
}
