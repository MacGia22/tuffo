import type { Metadata } from "next";
import Link from "next/link";
import { feedbackHref } from "@/lib/feedback";
import { WarmOffline } from "@/components/warm-offline";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { effectsOf, PLAN_OWN_MODEL_PAIRS } from "@/engine/server";
import { ActivityList, type ActivityItem } from "@/components/activity-list";
import { AdvicePanel } from "@/components/advice-panel";
import { BetweenTests } from "@/components/between-tests";
import { ChlorineUse } from "@/components/chlorine-use";
import { ConfirmButton } from "@/components/confirm-button";
import { planAddLabel, PlanStrip } from "@/components/plan-strip";
import { SaltCellForm } from "@/components/salt-cell-form";
import { cellLevels, cellRatedHours, levelsText } from "@/lib/salt-cells";
import { canSeePlan } from "@/lib/entitlements";
import { refreshPlanAfterResponse } from "@/lib/plan/build";
import { parseStoredPlan, planHasFcLine, planIsStale, type StoredPlan } from "@/lib/plan/stored";
import { PoolCrumbs } from "@/components/pool-crumbs";
import { TrendCharts } from "@/components/trend-charts";
import { adviseFor } from "@/lib/advice";
import { catalogProduct } from "@/lib/catalog";
import { baseToShelf, formatShelf, type BaseUnit } from "@/lib/dose-format";
import { describeEvent } from "@/lib/events";
import { formatDateTime, formatDay, formatTemperature, formatVolume, methodLabel, type Units } from "@/lib/format";
import { isUuid } from "@/lib/form-data";
import { loadPoolEstimate } from "@/lib/model/pool-estimate";
import { chlorineUse } from "@/lib/model/usage";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { retryAllOnClockSkew } from "@/lib/supabase/retry";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildTrend, rangeStart, parseRange, TREND_RANGES, type TrendRange } from "@/lib/trends";
import { FRESH_HOURS, refreshCellIfStale } from "@/lib/weather/job";
import { loadOwnRain, withOwnRain } from "@/lib/weather/own-rain";
import { localDateRange, summarizeBetween, type WeatherDay } from "@/lib/weather/summary";
import { deleteEntry } from "./actions";
import { DoneForm } from "./maintenance/maintenance-forms";
import { ChevronDownIcon, GearIcon, PlusIcon } from "@/components/icons";
import { StatusTiles } from "@/components/status-tiles";
import { testAge, tilesFor } from "@/lib/tiles";
import { MenuButton } from "@/components/log-menu";
import { logLinks } from "@/lib/log-links";
import { dueParts, dueTasks, healthItems } from "@/lib/maintenance";
import { HealthRow } from "@/components/maintenance-visuals";
import { SetupChecklist } from "@/components/setup-checklist";
import { setupSteps } from "@/lib/setup";
import { KIND_LABELS } from "@/lib/equipment";
import { loadPoolMaintenance } from "@/lib/maintenance-data";

interface Pool {
  id: string;
  name: string;
  volume_l: number;
  sanitizer: "chlorine" | "swg";
  surface: "plaster" | "vinyl" | "fiberglass";
  covered: boolean;
  cell_id: string | null;
  place_label: string | null;
  timezone: string | null;
  swg_cell_lb_per_day: number | null;
  swg_cell_model: string | null;
}

interface Reading {
  id: string;
  taken_at: string;
  fc: number | null;
  cc: number | null;
  ph: number | null;
  ta: number | null;
  ch: number | null;
  cya: number | null;
  salt: number | null;
  water_temp_c: number | null;
  borate: number | null;
  method: string;
}

interface Dose {
  id: string;
  added_at: string;
  product_id: string;
  amount: number;
  unit: BaseUnit;
  notes: string | null;
}

interface PoolEvent {
  id: string;
  occurred_at: string;
  kind: string;
  value: number | null;
  notes: string | null;
}

/**
 * The pool's learned chlorine use. pool_models is server-only, so it is read with the
 * service key, and only after the signed-in user's own query has returned the pool.
 * Fails open: the page shows without it.
 */
async function loadChlorineUse(poolId: string, cya: number | null, covered: boolean) {
  try {
    const { data } = await createSupabaseAdminClient()
      .from("pool_models")
      .select("coefficients, sample_count")
      .eq("pool_id", poolId)
      .maybeSingle<{ coefficients: unknown; sample_count: number }>();
    return chlorineUse(data ?? null, { cya, covered });
  } catch (err) {
    console.error(`[model] read ${poolId}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

interface WeatherRow extends WeatherDay {
  date: string;
}

const DAY_MS = 86_400_000;

export async function generateMetadata({ params }: PageProps<"/app/pools/[id]">): Promise<Metadata> {
  const { id } = await params;
  if (!isUuid(id)) return { title: "Pool" };
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("pools").select("name").eq("id", id).maybeSingle<{ name: string }>();
  return { title: data?.name ?? "Pool" };
}

function cell(value: number | null, decimals = 1) {
  return value === null ? "—" : Number(value).toFixed(decimals);
}

/** pH as tested: one decimal, two when the tester gave two. */
function phText(value: number | null) {
  return value === null
    ? "—"
    : Number(value).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 2 });
}

function doseLabel(dose: Dose, units: Units): string {
  const shelf = baseToShelf(Number(dose.amount), dose.unit, units);
  const name = catalogProduct(dose.product_id)?.short ?? dose.product_id;
  return `${shelf.value > 0 ? formatShelf(shelf.value, shelf.unit) : "a little"} of ${name}`;
}

/** Free chlorine a dose adds to this pool, ppm (0 for products that do not add chlorine). */
function fcAddedBy(dose: Dose, liters: number): number {
  try {
    return effectsOf(dose.product_id, Number(dose.amount), liters).fc ?? 0;
  } catch {
    return 0;
  }
}

/** Everything the pool page shows, loaded and shaped per request. */
async function loadPoolView(id: string, range: TrendRange) {
  const now = Date.now();
  // Rows a little before the chart's window (the season can reach back to January).
  const lookbackDays = range === "season" ? 380 : Number(range) + 15;
  const since = new Date(now - lookbackDays * DAY_MS).toISOString();
  const supabase = await createSupabaseServerClient();
  const [{ data: pool }, { data: readings }, { data: doses }, { data: events }, { data: profile }] =
    await retryAllOnClockSkew(() =>
      Promise.all([
        supabase.from("pools").select("*").eq("id", id).maybeSingle<Pool>(),
        supabase
          .from("readings")
          .select("id, taken_at, fc, cc, ph, ta, ch, cya, salt, water_temp_c, borate, method")
          .eq("pool_id", id)
          .order("taken_at", { ascending: false })
          .limit(lookbackDays > 60 ? 1000 : 100)
          .returns<Reading[]>(),
        supabase
          .from("doses")
          .select("id, added_at, product_id, amount, unit, notes")
          .eq("pool_id", id)
          .gte("added_at", since)
          .order("added_at", { ascending: false })
          .limit(200)
          .returns<Dose[]>(),
        supabase
          .from("events")
          .select("id, occurred_at, kind, value, notes")
          .eq("pool_id", id)
          .gte("occurred_at", since)
          .order("occurred_at", { ascending: false })
          .limit(100)
          .returns<PoolEvent[]>(),
        supabase.from("profiles").select("units").maybeSingle<{ units: Units }>(),
      ]),
    );
  if (!pool) notFound();

  const units = profile?.units ?? "us";
  const tz = pool.timezone ?? "UTC";
  const liters = Number(pool.volume_l);
  const allReadings = readings ?? [];
  const allDoses = doses ?? [];
  const allEvents = events ?? [];
  const latest = allReadings[0];
  const previous = allReadings[1];
  const latestCya = allReadings.find((r) => r.cya !== null)?.cya ?? null;
  // The chart's first day for the chosen range.
  const yearStart = `${localDateRange(new Date(now).toISOString(), new Date(now).toISOString(), tz).to.slice(0, 4)}-01-01`;
  const firstThisYear =
    [...allReadings]
      .filter((r) => localDateRange(r.taken_at, r.taken_at, tz).to >= yearStart)
      .sort((a, b) => Date.parse(a.taken_at) - Date.parse(b.taken_at))[0]?.taken_at ?? null;
  const windowStart = rangeStart(range, now, tz, firstThisYear);
  const [use, estimate] = await Promise.all([
    loadChlorineUse(pool.id, latestCya === null ? null : Number(latestCya), pool.covered),
    // Estimated FC since the last test and what Tuffo expected at recent tests; fails open.
    loadPoolEstimate(createSupabaseAdminClient(), pool.id, now),
  ]);
  const today = localDateRange(new Date(now).toISOString(), new Date(now).toISOString(), tz).to;

  // The 7-day plan, written by the server. A missing or old one is rebuilt after the
  // response, so the next visit has it; the page never waits for it.
  let plan: StoredPlan | null = null;
  if (await canSeePlan()) {
    const { data: planRow } = await supabase
      .from("plans")
      .select("computed_at, version, summary, days")
      .eq("pool_id", pool.id)
      .maybeSingle<{ computed_at: string; version: number; summary: unknown; days: unknown }>();
    plan = parseStoredPlan(planRow ?? null);
    const latestFcAt = allReadings.find((r) => r.fc !== null)?.taken_at ?? null;
    if (pool.cell_id && latestFcAt && planIsStale(plan, latestFcAt, now)) refreshPlanAfterResponse(pool.id);
  }

  const ownModel = Math.max(use?.pairs ?? 0, plan?.summary.pairs ?? 0) >= PLAN_OWN_MODEL_PAIRS;

  // Weather for the chart window (and the between-tests box), plus today's forecast.
  let weather: Array<WeatherRow & { ownRain: boolean }> = [];
  let forecastDays: WeatherRow[] = [];
  let lastActualsAt: string | null = null;
  if (pool.cell_id) {
    const [{ data: daily }, { data: forecast }, { data: cellRow }, ownRain] = await Promise.all([
      supabase
        .from("weather_daily")
        .select("date, tmax_c, tmin_c, uv_index_max, sunshine_s, precipitation_mm")
        .eq("cell_id", pool.cell_id)
        .gte("date", windowStart)
        .order("date")
        .returns<WeatherRow[]>(),
      supabase
        .from("weather_forecast")
        .select("date, tmax_c, tmin_c, uv_index_max, sunshine_s, precipitation_mm")
        .eq("cell_id", pool.cell_id)
        .gte("date", today)
        .order("date")
        .limit(7)
        .returns<WeatherRow[]>(),
      supabase
        .from("weather_cells")
        .select("last_actuals_at")
        .eq("id", pool.cell_id)
        .maybeSingle<{ last_actuals_at: string | null }>(),
      loadOwnRain(supabase, pool.id, windowStart),
    ]);
    forecastDays = forecast ?? [];
    const rows = daily ?? [];
    const todayForecast = forecastDays.find((w) => w.date === today);
    if (todayForecast && !rows.some((w) => w.date === today)) rows.push(todayForecast);
    // The owner's rain at the pool, where logged, in place of the cell's.
    weather = withOwnRain(rows, ownRain);
    lastActualsAt = cellRow?.last_actuals_at ?? null;

    // The nightly job keeps cells fresh; if it has not run for this one, refresh it
    // after the response so the next visit has the weather.
    if (!lastActualsAt || now - Date.parse(lastActualsAt) > FRESH_HOURS * 3_600_000) {
      const cellId = pool.cell_id;
      after(() => refreshCellIfStale(createSupabaseAdminClient(), cellId));
    }
  }

  let between = null;
  if (latest && previous) {
    const range = localDateRange(previous.taken_at, latest.taken_at, tz);
    const inRange = weather.filter((w) => w.date >= range.from && w.date <= range.to);
    const t0 = Date.parse(previous.taken_at);
    const t1 = Date.parse(latest.taken_at);
    const dosesBetween = allDoses.filter((d) => Date.parse(d.added_at) > t0 && Date.parse(d.added_at) <= t1);
    const fcAddedPpm = dosesBetween.reduce((sum, d) => sum + fcAddedBy(d, liters), 0);
    const notes = allEvents
      .filter((e) => Date.parse(e.occurred_at) > t0 && Date.parse(e.occurred_at) <= t1)
      .filter((e) => e.kind === "refill" || e.kind === "drain_refill" || e.kind === "heavy_use")
      .reverse()
      .map(
        (e) =>
          `${describeEvent(e.kind, e.value === null ? null : Number(e.value), units)}, ${formatDateTime(e.occurred_at, tz)}`,
      );
    between = summarizeBetween(previous, latest, inRange, { fcAddedPpm, notes });
  }

  const dosesSinceTest = latest
    ? allDoses
        .filter((d) => Date.parse(d.added_at) > Date.parse(latest.taken_at))
        .reverse()
        .map((d) => {
          const shelf = baseToShelf(Number(d.amount), d.unit, units);
          return {
            productId: d.product_id,
            amount: Number(d.amount),
            amountText: shelf.value > 0 ? formatShelf(shelf.value, shelf.unit) : "a little",
            dateText: formatDay(d.added_at, tz),
          };
        })
    : [];

  const advice = latest
    ? adviseFor(
        { volumeL: liters, sanitizer: pool.sanitizer, surface: pool.surface },
        {
          fc: latest.fc,
          cc: latest.cc,
          ph: latest.ph,
          ta: latest.ta,
          ch: latest.ch,
          cya: latest.cya,
          salt: latest.salt,
          waterTempC: latest.water_temp_c,
          borate: latest.borate,
        },
        dosesSinceTest,
        // Salt pools: the plan's cell setting, or a prompt for the cell's rating.
        pool.sanitizer === "swg"
          ? pool.swg_cell_lb_per_day === null
            ? { percent: null, needPpm: plan?.summary.swgNeedPpm ?? null, missing: "rating" as const }
            : plan?.summary.cellNeeds === "pump"
              ? { percent: null, needPpm: plan.summary.swgNeedPpm, missing: "pump" as const }
              : plan
                ? { percent: plan.summary.swgPercent, needPpm: plan.summary.swgNeedPpm }
                : undefined
          : undefined,
      )
    : null;

  const trend =
    allReadings.length > 0 || weather.length > 0
      ? buildTrend({
          timeZone: tz,
          start: windowStart,
          now,
          units,
          readings: allReadings.map((r) => ({ taken_at: r.taken_at, fc: r.fc, ph: r.ph })),
          estimate: estimate?.sinceLastTest ?? null,
          // Expected-vs-measured only once the pool has its own model (4 test pairs).
          expected: ownModel ? (estimate?.expectations ?? []) : [],
          doses: allDoses.map((d) => ({ added_at: d.added_at, label: doseLabel(d, units) })),
          weather: weather.map((w) => ({
            date: w.date,
            uv_index_max: w.uv_index_max,
            precipitation_mm: w.precipitation_mm,
            ownRain: w.ownRain,
          })),
          fcBand: advice
            ? { low: advice.targets.fc.targetLow, high: advice.targets.fc.targetHigh }
            : { low: 3, high: 5 },
          phBand: { low: 7.2, high: 7.8 },
          // A salt pool's plan without the cell's output has no meaningful FC line.
          plan:
            plan && planHasFcLine(plan.summary)
              ? {
                  continuous: plan.summary.kind === "swg",
                  days: plan.days.map((d) => {
                    const add = planAddLabel(d, units);
                    const w = forecastDays.find((f) => f.date === d.date);
                    return {
                      date: d.date,
                      fcAfterAdd: d.fcAfterAdd,
                      fcEnd: d.fcEnd,
                      add: add ? `${add} of liquid chlorine` : null,
                      uv_index_max: w?.uv_index_max ?? null,
                      precipitation_mm: w?.precipitation_mm ?? d.rainMm,
                    };
                  }),
                }
              : null,
        })
      : null;

  const activity: ActivityItem[] = [
    ...allDoses.map((d) => ({
      id: d.id,
      kind: "dose" as const,
      at: d.added_at,
      when: formatDateTime(d.added_at, tz),
      text: `Added ${doseLabel(d, units)}`,
      notes: d.notes,
    })),
    ...allEvents.map((e) => ({
      id: e.id,
      kind: "event" as const,
      at: e.occurred_at,
      when: formatDateTime(e.occurred_at, tz),
      text: describeEvent(e.kind, e.value === null ? null : Number(e.value), units),
      notes: e.notes,
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 15);

  // Salt pools: the setting and pump hours in force now.
  let saltStatus: { setting: number | null; settingSince: string | null; cellHours: number | null } | null = null;
  if (pool.sanitizer === "swg") {
    const [{ data: setting }, { data: schedule }] = await Promise.all([
      supabase
        .from("events")
        .select("value, occurred_at")
        .eq("pool_id", pool.id)
        .eq("kind", "cell_setting")
        .order("occurred_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ value: number | null; occurred_at: string }>(),
      supabase
        .from("pump_schedules")
        .select("cell_hours")
        .eq("pool_id", pool.id)
        .order("effective_from", { ascending: false })
        .limit(1)
        .maybeSingle<{ cell_hours: number | string }>(),
    ]);
    saltStatus = {
      setting: setting?.value === null || setting?.value === undefined ? null : Number(setting.value),
      settingSince: setting?.occurred_at ? formatDay(setting.occurred_at, tz) : null,
      cellHours: schedule ? Number(schedule.cell_hours) : null,
    };
  }

  const estimateMiss = ownModel ? (estimate?.miss ?? null) : null;
  return {
    pool,
    units,
    tz,
    liters,
    allReadings,
    latest,
    advice,
    between,
    use,
    trend,
    activity,
    plan,
    today,
    saltStatus,
    estimateMiss,
    now,
  };
}

export default async function PoolPage({ params, searchParams }: PageProps<"/app/pools/[id]">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const range = parseRange((await searchParams).range);
  const {
    pool,
    units,
    tz,
    liters,
    allReadings,
    latest,
    advice,
    between,
    use,
    trend,
    activity,
    plan,
    today,
    saltStatus,
    estimateMiss,
    now,
  } = await loadPoolView(id, range);
  // Upkeep due now or within days; fails open (nothing shown).
  const upkeep = await loadPoolMaintenance(await createSupabaseServerClient(), pool.id, { cellHours: true });
  const upkeepDue = upkeep ? dueTasks(upkeep.statuses) : [];
  // The sticky bar's anchors: only sections on the page.
  const sections = [
    { id: "today", label: "Today", show: Boolean(latest) },
    { id: "plan", label: "Plan", show: Boolean(plan) },
    { id: "trends", label: "Trends", show: Boolean(trend) },
    { id: "maintenance", label: "Maintenance", show: upkeepDue.length > 0 },
    { id: "history", label: "History", show: allReadings.length > 0 },
  ].filter((s) => s.show);
  const { data: alertRow } = await (await createSupabaseServerClient())
    .from("alert_settings")
    .select("*")
    .eq("pool_id", pool.id)
    .maybeSingle<Record<string, unknown>>();
  const setup = setupSteps({
    poolId: pool.id,
    swg: pool.sanitizer === "swg",
    hasLocation: Boolean(pool.cell_id),
    hasTest: allReadings.length > 0,
    hasEquipment: (upkeep?.equipment.length ?? 0) > 0,
    hasFilter: Boolean(upkeep?.equipment.some((e) => e.kind === "filter")),
    cellInstalled: Boolean(upkeep?.cell?.installedOn),
    hasCleanPressure: Boolean(upkeep?.pressure?.clean),
    hasPumpSchedule: saltStatus?.cellHours !== null && saltStatus?.cellHours !== undefined,
    alertsOn: Boolean(
      alertRow && ["algae", "test_reminder", "weekly", "maintenance"].some((k) => alertRow[k] === true),
    ),
  });
  const health = upkeep
    ? healthItems({
        today: upkeep.today,
        cell: upkeep.cell
          ? {
              installedOn: upkeep.cell.installedOn,
              hoursUsed: upkeep.cell.hours?.hours ?? null,
              ratedHours: cellRatedHours(upkeep.cell.model),
            }
          : null,
        equipment: upkeep.equipment.map((e) => ({
          kind: e.kind,
          type: e.type,
          installedOn: e.installedOn,
          label: KIND_LABELS[e.kind],
        })),
      })
    : [];
  // The tiles' targets: the pool's (from the advice), or typical ones before a full test.
  const t = advice?.targets;
  const tileTargets = {
    fc: t ? { low: t.fc.targetLow, high: t.fc.targetHigh } : { low: 3, high: 5 },
    ph: t ? { low: t.ph.low, high: t.ph.high } : { low: 7.2, high: 7.8 },
    ta: t?.ta ?? { low: 60, high: 90 },
    ch: t?.ch ?? { low: 250, high: 450 },
    cya: t?.cya ?? { low: 30, high: 50 },
    salt: t?.salt,
  };

  return (
    <>
      <PoolCrumbs poolId={pool.id} poolName={pool.name} />
      <WarmOffline
        urls={["/app", ...["readings", "doses", "events"].map((kind) => `/app/pools/${pool.id}/${kind}/new`)]}
      />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-semibold">{pool.name}</h1>
            <Link
              href={`/app/pools/${pool.id}/settings`}
              aria-label={`Settings for ${pool.name}`}
              title="Settings"
              className="rounded-lg p-1.5 text-muted hover:bg-lagoon/10 hover:text-foreground"
            >
              <GearIcon className="h-6 w-6" />
            </Link>
          </div>
          <p className="text-muted">
            {formatVolume(liters, units)} · {pool.sanitizer === "swg" ? "Salt water chlorinator" : "Chlorine"} ·{" "}
            {pool.surface}
            {pool.covered ? " · covered" : ""}
            {pool.place_label ? ` · ${pool.place_label}` : ""}
            {" · "}
            <Link href={`/app/pools/${pool.id}/maintenance`} className="text-lagoon underline-offset-2 hover:underline">
              Maintenance
            </Link>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <MenuButton
            label="Log"
            placement="below-end"
            items={logLinks(pool.id, `/app/pools/${pool.id}`)}
            buttonClassName="flex items-center gap-1.5 rounded-xl bg-lagoon px-4 py-2.5 text-sm font-semibold text-white hover:bg-lagoon-deep"
          >
            <PlusIcon className="h-5 w-5" />
            Log
            <ChevronDownIcon className="h-4 w-4" />
          </MenuButton>
          <MenuButton
            label="More actions"
            placement="below-end"
            items={[
              { href: `/app/pools/${pool.id}/import`, label: "Import CSV" },
              { href: feedbackHref(`/app/pools/${pool.id}`), label: "Send feedback" },
            ]}
            buttonClassName="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface text-lg font-semibold hover:border-lagoon"
          >
            <span aria-hidden="true">⋯</span>
          </MenuButton>
        </div>
      </div>

      {sections.length > 0 ? (
        <nav
          aria-label="On this page"
          className="sticky top-0 z-20 -mx-5 -my-4 border-b border-border bg-background/90 px-5 py-2 backdrop-blur"
        >
          <ul className="flex gap-1 overflow-x-auto text-sm">
            {sections.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="block whitespace-nowrap rounded-lg px-3 py-1.5 font-semibold text-muted hover:bg-lagoon/10 hover:text-foreground"
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      <SetupChecklist poolId={pool.id} steps={setup} />

      {latest ? (
        <StatusTiles
          tiles={tilesFor(latest, tileTargets, { swg: pool.sanitizer === "swg" })}
          extra={[
            ["Water", latest.water_temp_c === null ? "—" : formatTemperature(Number(latest.water_temp_c), units)],
          ]}
          age={testAge(latest.taken_at, now)}
          testedAt={formatDateTime(latest.taken_at, tz)}
          method={methodLabel(latest.method)}
          logHref={`/app/pools/${pool.id}/readings/new`}
        />
      ) : (
        <section className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-border p-8">
          <h2 className="text-xl font-semibold">No tests logged yet</h2>
          <p className="max-w-lg text-muted">
            Log your first water test. From the second one on, Tuffo can show what the weather did in between and what
            to add next.
          </p>
          <Link
            href={`/app/pools/${pool.id}/readings/new`}
            className="rounded-xl bg-lagoon px-4 py-2.5 text-sm font-semibold text-white hover:bg-lagoon-deep"
          >
            Log the first test
          </Link>
          <Link href={`/app/pools/${pool.id}/import`} className="text-sm font-semibold text-lagoon">
            Or import your history from Pool Math (CSV)
          </Link>
        </section>
      )}

      {advice && advice.items.length > 0 ? <AdvicePanel advice={advice} units={units} poolId={pool.id} /> : null}

      {saltStatus ? (
        <section
          aria-label="Salt cell"
          className="flex flex-col gap-1 rounded-2xl border border-border bg-surface p-4 text-sm"
        >
          <p>
            Cell setting: <strong>{saltStatus.setting === null ? "not logged yet" : `${saltStatus.setting}%`}</strong>
            {saltStatus.settingSince ? ` since ${saltStatus.settingSince}` : ""} ·{" "}
            <Link href={`/app/pools/${pool.id}/events/new?kind=cell_setting`} className="font-semibold text-lagoon">
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
            <Link href={`/app/pools/${pool.id}/pump`} className="font-semibold text-lagoon">
              {saltStatus.cellHours === null ? "Add the schedule" : "Change"}
            </Link>
          </p>
          {saltStatus.setting === null || saltStatus.cellHours === null ? (
            <p className="text-xs text-muted">
              Until both are known, Tuffo leaves this pool&apos;s tests out of its chlorine model rather than guess what
              the cell made.
            </p>
          ) : null}
        </section>
      ) : null}

      {pool.sanitizer === "swg" ? (
        <SaltCellForm
          poolId={pool.id}
          current={{
            model: pool.swg_cell_model ?? null,
            lbPerDay: pool.swg_cell_lb_per_day === null ? null : Number(pool.swg_cell_lb_per_day),
          }}
        />
      ) : null}

      {plan ? (
        <PlanStrip
          plan={plan}
          units={units}
          today={today}
          poolId={pool.id}
          cellLevels={pool.sanitizer === "swg" ? levelsText(cellLevels(pool.swg_cell_model)) : null}
          levels={pool.sanitizer === "swg" ? cellLevels(pool.swg_cell_model) : null}
        />
      ) : null}

      {upkeepDue.length > 0 ? (
        <section
          id="maintenance"
          aria-labelledby="upkeep"
          className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="upkeep" className="text-xl font-semibold">
              Maintenance due
            </h2>
            <Link href={`/app/pools/${pool.id}/maintenance`} className="text-sm font-semibold text-lagoon">
              All maintenance
            </Link>
          </div>
          <ul className="flex flex-col gap-3">
            {upkeepDue.map((s) => (
              <li key={s.task.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  <span className="font-semibold">{s.task.label}</span>{" "}
                  <span className={s.state === "overdue" ? "text-red-700 dark:text-red-300" : "text-muted"}>
                    · {dueParts(s, upkeep?.today ?? today).relative}
                  </span>
                </span>
                <DoneForm poolId={pool.id} task={s.task.id} taskLabel={s.task.label} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <HealthRow items={health} href={`/app/pools/${pool.id}/maintenance#life`} />

      {trend ? (
        <section
          aria-labelledby="trends"
          className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 sm:p-5"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="trends" className="text-xl font-semibold">
              {range === "season" ? "This season" : `Last ${range} days`}
            </h2>
            <nav aria-label="Chart range" className="w-full sm:w-auto sm:order-last">
              <ul className="inline-flex rounded-xl border border-border bg-background p-0.5 text-xs font-semibold">
                {TREND_RANGES.map((r) => (
                  <li key={r.value}>
                    <Link
                      href={`/app/pools/${pool.id}${r.value === "30" ? "" : `?range=${r.value}`}#trends`}
                      scroll={false}
                      aria-current={r.value === range ? "true" : undefined}
                      className={`block rounded-lg px-2.5 py-1.5 ${
                        r.value === range ? "bg-lagoon text-white" : "text-muted hover:text-foreground"
                      }`}
                    >
                      {r.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
            <p className="text-xs text-muted">Shaded bands are the targets for this pool. ▼ marks a logged dose.</p>
            {estimateMiss ? (
              <p className="text-xs text-muted">
                Tuffo&apos;s estimates were within about {estimateMiss.ppm} ppm on your last {estimateMiss.count} tests
                {estimateMiss.ppm > 1.5 ? "; it is still learning this pool" : ""}.
              </p>
            ) : null}
          </div>
          <TrendCharts data={trend} rainHref={pool.cell_id ? `/app/pools/${pool.id}/rain` : null} />
        </section>
      ) : null}

      {between ? <BetweenTests summary={between} units={units} swg={pool.sanitizer === "swg"} /> : null}

      {use ? <ChlorineUse use={use} units={units} swg={pool.sanitizer === "swg"} /> : null}

      {activity.length > 0 ? <ActivityList poolId={pool.id} items={activity} /> : null}

      {allReadings.length > 0 ? (
        <section aria-labelledby="history" className="flex flex-col gap-3">
          <h2 id="history" className="text-xl font-semibold">
            Test history
          </h2>
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full min-w-[700px] text-sm">
              <thead className="bg-surface text-left text-xs font-semibold text-muted">
                <tr>
                  <th className="px-4 py-3">When</th>
                  <th className="px-3 py-3 text-right">FC</th>
                  <th className="px-3 py-3 text-right">CC</th>
                  <th className="px-3 py-3 text-right">pH</th>
                  <th className="px-3 py-3 text-right">TA</th>
                  <th className="px-3 py-3 text-right">CH</th>
                  <th className="px-3 py-3 text-right">CYA</th>
                  <th className="px-3 py-3 text-right">Salt</th>
                  <th className="px-3 py-3 text-right">Temp</th>
                  <th className="px-3 py-3">
                    <span className="sr-only">Edit or remove</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {allReadings.slice(0, 30).map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-4 py-2.5 whitespace-nowrap">{formatDateTime(r.taken_at, tz)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{cell(r.fc)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{cell(r.cc)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{phText(r.ph)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{cell(r.ta, 0)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{cell(r.ch, 0)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{cell(r.cya, 0)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{cell(r.salt, 0)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {r.water_temp_c === null ? "—" : formatTemperature(Number(r.water_temp_c), units)}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <div className="flex justify-end gap-2">
                        <Link
                          href={`/app/pools/${pool.id}/readings/${r.id}/edit`}
                          aria-label={`Edit the test from ${formatDateTime(r.taken_at, tz)}`}
                          className="rounded-lg border border-border px-3 py-1.5 font-semibold hover:border-lagoon"
                        >
                          Edit
                        </Link>
                        <form action={deleteEntry}>
                          <input type="hidden" name="pool_id" value={pool.id} />
                          <input type="hidden" name="kind" value="reading" />
                          <input type="hidden" name="id" value={r.id} />
                          <ConfirmButton
                            question={`Remove the test from ${formatDateTime(r.taken_at, tz)}?`}
                            label="Remove"
                          />
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </>
  );
}
