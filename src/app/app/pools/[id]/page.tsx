import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { effectsOf } from "@/engine/server";
import { ActivityList, type ActivityItem } from "@/components/activity-list";
import { AdvicePanel } from "@/components/advice-panel";
import { BetweenTests } from "@/components/between-tests";
import { ChlorineUse } from "@/components/chlorine-use";
import { ConfirmButton } from "@/components/confirm-button";
import { PoolCrumbs } from "@/components/pool-crumbs";
import { TrendCharts } from "@/components/trend-charts";
import { adviseFor } from "@/lib/advice";
import { catalogProduct } from "@/lib/catalog";
import { baseToShelf, formatShelf, type BaseUnit } from "@/lib/dose-format";
import { describeEvent } from "@/lib/events";
import { formatDateTime, formatDay, formatTemperature, formatVolume, methodLabel, type Units } from "@/lib/format";
import { isUuid } from "@/lib/form-data";
import { chlorineUse } from "@/lib/model/usage";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { retryAllOnClockSkew } from "@/lib/supabase/retry";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildTrend, MAX_DAYS } from "@/lib/trends";
import { FRESH_HOURS, refreshCellIfStale } from "@/lib/weather/job";
import { localDateRange, summarizeBetween, type WeatherDay } from "@/lib/weather/summary";
import { deleteEntry } from "./actions";

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
async function loadPoolView(id: string) {

  const now = Date.now();
  const since = new Date(now - (MAX_DAYS + 15) * DAY_MS).toISOString();
  const supabase = await createSupabaseServerClient();
  const [{ data: pool }, { data: readings }, { data: doses }, { data: events }, { data: profile }] =
    await retryAllOnClockSkew(() =>
      Promise.all([
        supabase
          .from("pools")
          .select("id, name, volume_l, sanitizer, surface, covered, cell_id, place_label, timezone")
          .eq("id", id)
          .maybeSingle<Pool>(),
        supabase
          .from("readings")
          .select("id, taken_at, fc, cc, ph, ta, ch, cya, salt, water_temp_c, borate, method")
          .eq("pool_id", id)
          .order("taken_at", { ascending: false })
          .limit(100)
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
  const use = await loadChlorineUse(pool.id, latestCya === null ? null : Number(latestCya), pool.covered);

  // Weather for the chart window (and the between-tests box), plus today's forecast.
  let weather: WeatherRow[] = [];
  let lastActualsAt: string | null = null;
  if (pool.cell_id) {
    const windowStart = new Date(now - MAX_DAYS * DAY_MS).toISOString().slice(0, 10);
    const today = localDateRange(new Date(now).toISOString(), new Date(now).toISOString(), tz).to;
    const [{ data: daily }, { data: forecast }, { data: cellRow }] = await Promise.all([
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
        .eq("date", today)
        .returns<WeatherRow[]>(),
      supabase.from("weather_cells").select("last_actuals_at").eq("id", pool.cell_id).maybeSingle<{ last_actuals_at: string | null }>(),
    ]);
    weather = daily ?? [];
    if (forecast?.[0] && !weather.some((w) => w.date === today)) weather.push(forecast[0]);
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
      .map((e) => `${describeEvent(e.kind, e.value === null ? null : Number(e.value), units)}, ${formatDateTime(e.occurred_at, tz)}`);
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
      )
    : null;

  const trend =
    allReadings.length > 0 || weather.length > 0
      ? buildTrend({
          timeZone: tz,
          now,
          units,
          readings: allReadings.map((r) => ({ taken_at: r.taken_at, fc: r.fc, ph: r.ph })),
          doses: allDoses.map((d) => ({ added_at: d.added_at, label: doseLabel(d, units) })),
          weather: weather.map((w) => ({ date: w.date, uv_index_max: w.uv_index_max, precipitation_mm: w.precipitation_mm })),
          fcBand: advice
            ? { low: advice.targets.fc.targetLow, high: advice.targets.fc.targetHigh }
            : { low: 3, high: 5 },
          phBand: { low: 7.2, high: 7.8 },
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

  return { pool, units, tz, liters, allReadings, latest, advice, between, use, trend, activity };
}

export default async function PoolPage({ params }: PageProps<"/app/pools/[id]">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { pool, units, tz, liters, allReadings, latest, advice, between, use, trend, activity } = await loadPoolView(id);

  const secondary =
    "rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold hover:border-lagoon";

  return (
    <>
      <PoolCrumbs poolId={pool.id} poolName={pool.name} />

      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-3xl font-semibold">{pool.name}</h1>
          <p className="text-muted">
            {formatVolume(liters, units)} · {pool.sanitizer === "swg" ? "Salt water chlorinator" : "Chlorine"} ·{" "}
            {pool.surface}
            {pool.covered ? " · covered" : ""}
            {pool.place_label ? ` · ${pool.place_label}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/app/pools/${pool.id}/readings/new`}
            className="rounded-xl bg-lagoon px-4 py-2.5 text-sm font-semibold text-white hover:bg-lagoon-deep"
          >
            Log a test
          </Link>
          <Link href={`/app/pools/${pool.id}/doses/new`} className={secondary}>
            Log a dose
          </Link>
          <Link href={`/app/pools/${pool.id}/events/new`} className={secondary}>
            Log an event
          </Link>
        </div>
      </div>

      {latest ? (
        <section aria-labelledby="latest" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <h2 id="latest" className="sr-only">
            Latest test
          </h2>
          {(
            [
              ["Free chlorine", cell(latest.fc), "ppm"],
              ["pH", phText(latest.ph), ""],
              ["Alkalinity", cell(latest.ta, 0), "ppm"],
              ["Calcium", cell(latest.ch, 0), "ppm"],
              ["Stabilizer", cell(latest.cya, 0), "ppm"],
              ["Water", latest.water_temp_c === null ? "—" : formatTemperature(Number(latest.water_temp_c), units), ""],
            ] as const
          ).map(([name, value, unit]) => (
            <div key={name} className="rounded-2xl border border-border bg-surface p-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted">{name}</div>
              <div className="mt-1 text-2xl font-semibold">
                {value} <span className="text-sm font-normal text-muted">{unit}</span>
              </div>
            </div>
          ))}
          <p className="col-span-2 text-sm text-muted sm:col-span-3 lg:col-span-6">
            Tested {formatDateTime(latest.taken_at, tz)} · {methodLabel(latest.method)}
          </p>
        </section>
      ) : (
        <section className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-border p-8">
          <h2 className="text-xl font-semibold">No tests logged yet</h2>
          <p className="max-w-lg text-muted">
            Log your first water test. From the second one on, Tuffo can show what the weather did in between and
            what to add next.
          </p>
          <Link
            href={`/app/pools/${pool.id}/readings/new`}
            className="rounded-xl bg-lagoon px-4 py-2.5 text-sm font-semibold text-white hover:bg-lagoon-deep"
          >
            Log the first test
          </Link>
        </section>
      )}

      {advice && advice.items.length > 0 ? <AdvicePanel advice={advice} units={units} poolId={pool.id} /> : null}

      {between ? <BetweenTests summary={between} units={units} swg={pool.sanitizer === "swg"} /> : null}

      {use ? <ChlorineUse use={use} units={units} swg={pool.sanitizer === "swg"} /> : null}

      {trend ? (
        <section aria-labelledby="trends" className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 sm:p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="trends" className="text-xl font-semibold">
              Last {trend.days.length} days
            </h2>
            <p className="text-xs text-muted">Shaded bands are the targets for this pool. ▼ marks a logged dose.</p>
          </div>
          <TrendCharts data={trend} />
        </section>
      ) : null}

      {activity.length > 0 ? <ActivityList poolId={pool.id} items={activity} /> : null}

      {allReadings.length > 0 ? (
        <section aria-labelledby="history" className="flex flex-col gap-3">
          <h2 id="history" className="text-xl font-semibold">
            Test history
          </h2>
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full min-w-[700px] text-sm">
              <thead className="bg-surface text-left text-xs uppercase tracking-wider text-muted">
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
                    <span className="sr-only">Remove</span>
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
                      <form action={deleteEntry}>
                        <input type="hidden" name="pool_id" value={pool.id} />
                        <input type="hidden" name="kind" value="reading" />
                        <input type="hidden" name="id" value={r.id} />
                        <ConfirmButton question={`Remove the test from ${formatDateTime(r.taken_at, tz)}?`} label="Remove" />
                      </form>
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
