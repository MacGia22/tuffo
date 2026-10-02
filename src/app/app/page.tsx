import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isClockSkewError, retryAllOnClockSkew } from "@/lib/supabase/retry";
import { reportClockSkew } from "@/lib/supabase/settle";
import { formatVolume } from "@/lib/format";
import { DEFAULT_CYA, targetsFor } from "@/engine/server";
import { canSeePlan } from "@/lib/entitlements";
import { loadPoolMaintenance, poolLocalDate } from "@/lib/maintenance-data";
import { parseStoredPlan } from "@/lib/plan/stored";
import { cardFacts, type CardFacts } from "@/lib/pool-card";
import { LEVEL_LABEL } from "@/lib/tiles";
import { failed, LOAD_FAILED } from "@/lib/errors";

interface PoolRow {
  id: string;
  name: string;
  volume_l: number;
  sanitizer: "chlorine" | "swg";
  place_label: string | null;
  created_at: string;
  surface: "plaster" | "vinyl" | "fiberglass";
  timezone: string | null;
}

/** Each card's facts; fails open to a plain card. */
async function loadFacts(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  pools: PoolRow[],
  units: "us" | "metric",
): Promise<Map<string, CardFacts>> {
  const out = new Map<string, CardFacts>();
  try {
    const now = Date.now();
    const ids = pools.map((p) => p.id);
    const showPlan = await canSeePlan();
    const [{ data: plans }, { data: alerts }] = await Promise.all([
      showPlan
        ? supabase.from("plans").select("pool_id, computed_at, version, summary, days").in("pool_id", ids)
        : Promise.resolve({ data: [] as { pool_id: string; computed_at: string; version: number; summary: unknown; days: unknown }[] }),
      supabase.from("alert_settings").select("*").in("pool_id", ids),
    ]);
    await Promise.all(
      pools.map(async (pool) => {
        const [{ data: readings }, maintenance] = await Promise.all([
          supabase
            .from("readings")
            .select("taken_at, fc, cya")
            .eq("pool_id", pool.id)
            .order("taken_at", { ascending: false })
            .limit(30)
            .returns<{ taken_at: string; fc: number | null; cya: number | null }[]>(),
          loadPoolMaintenance(supabase, pool.id),
        ]);
        // Newest first, whatever order the rows came in.
        const rows = [...(readings ?? [])].sort((a, b) => Date.parse(b.taken_at) - Date.parse(a.taken_at));
        const withFc = rows.find((r) => r.fc !== null);
        const cya = rows.find((r) => r.cya !== null)?.cya;
        const fcTarget = targetsFor({
          swg: pool.sanitizer === "swg",
          surface: pool.surface,
          cya: cya === null || cya === undefined ? DEFAULT_CYA : Number(cya),
        }).fc;
        const planRow = (plans ?? []).find((r) => r.pool_id === pool.id);
        const alertRow = (alerts ?? []).find((r: { pool_id: string }) => r.pool_id === pool.id) as Record<string, unknown> | undefined;
        const statuses = maintenance?.statuses ?? [];
        out.set(
          pool.id,
          cardFacts({
            units,
            today: poolLocalDate(pool.timezone, now),
            timeZone: pool.timezone,
            now,
            latestFc: withFc
              ? { takenAt: withFc.taken_at, fc: Number(withFc.fc), target: { low: fcTarget.targetLow, high: fcTarget.targetHigh } }
              : null,
            lastTestAt: rows[0]?.taken_at ?? null,
            plan: planRow ? parseStoredPlan(planRow) : null,
            maintenance: maintenance
              ? {
                  overdue: statuses.filter((t) => t.state === "overdue").length,
                  due: statuses.filter((t) => t.state === "due").length,
                }
              : null,
            alertsOn: Boolean(alertRow && ["algae", "test_reminder", "weekly", "maintenance"].some((k) => alertRow[k] === true)),
          }),
        );
      }),
    );
  } catch (err) {
    console.error(`[pools] cards: ${err instanceof Error ? err.message : String(err)}`);
  }
  return out;
}

const chip = "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold";

export default async function PoolsPage() {
  const supabase = await createSupabaseServerClient();
  const [{ data: pools, error }, { data: profile }] = await retryAllOnClockSkew(() =>
    Promise.all([
      supabase
        .from("pools")
        .select("id, name, volume_l, sanitizer, place_label, created_at, surface, timezone")
        .order("created_at", { ascending: true })
        .returns<PoolRow[]>(),
      supabase.from("profiles").select("units").maybeSingle<{ units: "us" | "metric" }>(),
    ]),
  );
  const units = profile?.units ?? "us";
  const facts = pools && pools.length > 0 ? await loadFacts(supabase, pools, units) : new Map<string, CardFacts>();
  if (isClockSkewError(error)) {
    // Still refused after the retries: record how far ahead the token is, to fix it for good.
    const { data } = await supabase.auth.getSession();
    reportClockSkew("pools-list", data.session?.access_token);
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Your pools</h1>
          <p className="text-muted">Pick a pool to log a test or see what the weather has been doing to it.</p>
        </div>
        <Link
          href="/app/pools/new"
          className="rounded-xl bg-action px-4 py-2.5 text-sm font-semibold text-white hover:bg-action-deep"
        >
          Add a pool
        </Link>
      </div>

      {error ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p>{failed("pools list", error.message, LOAD_FAILED)}</p>
          <a href="/app" className="inline-flex min-h-11 items-center rounded-xl border border-red-300 bg-white px-4 font-semibold text-red-800">
            Try again
          </a>
        </div>
      ) : null}

      {pools && pools.length === 0 ? (
        <section className="flex flex-col items-start gap-4 rounded-2xl border border-dashed border-border p-8">
          <h2 className="text-xl font-semibold">No pools yet</h2>
          <p className="max-w-lg text-muted">
            Add your pool with its volume and town. Tuffo uses the town only to pick the weather for it; no address is
            stored.
          </p>
          <Link
            href="/app/pools/new"
            className="rounded-xl bg-action px-4 py-2.5 text-sm font-semibold text-white hover:bg-action-deep"
          >
            Add your first pool
          </Link>
        </section>
      ) : null}

      {pools && pools.length > 0 ? (
        <ul className="grid gap-4 sm:grid-cols-2">
          {pools.map((pool) => (
            <li
              key={pool.id}
              className="flex h-full flex-col rounded-2xl border border-border bg-surface transition hover:border-lagoon"
            >
              <Link href={`/app/pools/${pool.id}`} className="flex flex-1 flex-col gap-2 p-5 pb-3">
                <span className="text-lg font-semibold">{pool.name}</span>
                <span className="text-sm text-muted">
                  {formatVolume(pool.volume_l, units)} ·{" "}
                  {pool.sanitizer === "swg" ? "Salt water chlorinator" : "Chlorine"}
                  {pool.place_label ? ` · ${pool.place_label}` : ""}
                </span>
                <PoolFacts facts={facts.get(pool.id)} />
              </Link>
              <div className="flex flex-wrap gap-x-5 border-t border-border px-5 py-0.5 text-sm">
                <Link href={`/app/pools/${pool.id}`} className="inline-flex min-h-11 items-center font-semibold text-lagoon">
                  Open
                </Link>
                <Link href={`/app/pools/${pool.id}/settings`} className="inline-flex min-h-11 items-center font-semibold text-lagoon">
                  Settings and equipment
                </Link>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

function PoolFacts({ facts }: { facts: CardFacts | undefined }) {
  if (!facts) return null;
  const warn = "bg-sun/20 text-foreground";
  const calm = "bg-lagoon/10 text-lagoon-deep dark:text-ice";
  const plain = "bg-background text-muted";
  return (
    <ul className="mt-1 flex flex-wrap gap-1.5" aria-label="At a glance">
      <li className={`${chip} ${facts.age?.stale ? warn : plain}`}>
        {facts.age ? `Tested ${facts.age.text}` : "No tests yet"}
      </li>
      {facts.fc ? (
        <li className={`${chip} ${facts.fc.level === "ok" ? calm : warn}`}>
          <span aria-hidden="true">{facts.fc.level === "ok" ? "✓" : facts.fc.level === "low" ? "↓" : "↑"}</span>
          FC {facts.fc.value.toFixed(1)} · {LEVEL_LABEL[facts.fc.level]} · target {facts.fc.target}
        </li>
      ) : null}
      {facts.action ? <li className={`${chip} ${calm}`}>Today: {facts.action}</li> : null}
      {facts.maintenance ? (
        <li className={`${chip} ${facts.maintenance.overdue ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200" : warn}`}>
          <span aria-hidden="true">⚑</span> Maintenance {facts.maintenance.text}
        </li>
      ) : null}
      <li className={`${chip} ${plain}`}>Alerts {facts.alertsOn ? "on" : "off"}</li>
    </ul>
  );
}
