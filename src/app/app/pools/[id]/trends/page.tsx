import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TrendChart } from "@/components/trend-chart";
import { isUuid } from "@/lib/form-data";
import { bandAdvice } from "@/lib/plan/band";
import { cellLevels } from "@/lib/salt-cells";
import { parseRange, TREND_RANGES, DEFAULT_RANGE } from "@/lib/trends";
import { loadPoolView } from "../pool-view";

export const metadata: Metadata = { title: "Trends" };

/**
 * A pool's trends: free chlorine, pH, sun and rain by day, from a week back to the plan's
 * week ahead (or longer), then what happened between the last two tests.
 */
export default async function TrendsPage({ params, searchParams }: PageProps<"/app/pools/[id]/trends">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const range = parseRange((await searchParams).range);
  const { pool, trend, between, plan, today, estimateMiss } = await loadPoolView(id, range);
  const base = `/app/pools/${pool.id}`;
  const swg = pool.sanitizer === "swg";
  const band = plan ? bandAdvice(plan, today, swg ? cellLevels(pool.swg_cell_model) : null) : null;
  const stats = between?.stats ?? [];

  return (
    <>
      <nav aria-label="Breadcrumb" className="text-sm">
        <Link href={base} className="inline-flex min-h-11 items-center font-semibold text-lagoon">
          ← {pool.name}
        </Link>
      </nav>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-[28px] font-semibold leading-tight">Trends</h1>
        <nav aria-label="Chart range">
          <ul className="inline-flex rounded-xl border border-border bg-surface p-0.5 text-sm font-semibold">
            {TREND_RANGES.map((r) => (
              <li key={r.value}>
                <Link
                  href={`${base}/trends${r.value === DEFAULT_RANGE ? "" : `?range=${r.value}`}`}
                  scroll={false}
                  aria-current={r.value === range ? "page" : undefined}
                  className={`flex min-h-11 items-center rounded-lg px-3 ${
                    r.value === range ? "bg-lagoon text-white" : "text-muted hover:text-foreground"
                  }`}
                >
                  {r.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {trend ? (
        <section aria-label="Chart" className="rounded-2xl border border-border bg-surface p-3 sm:p-5">
          {/* Keyed by the range so the selected day resets to today with the new columns. */}
          <TrendChart key={range} data={trend} rainHref={pool.cell_id ? `${base}/rain` : null} />
          {estimateMiss ? (
            <p className="mt-2 text-xs text-muted">
              Tuffo&apos;s estimates were within about {estimateMiss.ppm} ppm on your last {estimateMiss.count} tests
              {estimateMiss.ppm > 1.5 ? "; it is still learning this pool" : ""}.
            </p>
          ) : null}
        </section>
      ) : (
        <p className="rounded-2xl border border-dashed border-border p-6 text-muted">
          Log a test, or set the pool&apos;s location in Settings, and its trends appear here.
        </p>
      )}

      {band ? (
        <section
          role="status"
          className={`flex flex-col gap-1 rounded-2xl border p-4 ${
            band.direction === "low" ? "border-chip-critical-border bg-chip-critical-bg text-chip-critical-fg" : "border-chip-warn-fg/40 bg-chip-warn-bg text-chip-warn-fg"
          }`}
        >
          <h2 className="font-sans text-base font-semibold">
            {band.direction === "low" ? "Chlorine runs below the minimum on the plan" : "Chlorine runs above target on the plan"}
          </h2>
          <p className="text-sm">{band.text}</p>
          <Link href={`${base}#actions`} className="inline-flex min-h-11 items-center self-start text-sm font-semibold underline underline-offset-2">
            What to do now
          </Link>
        </section>
      ) : null}

      {between ? (
        <section aria-labelledby="between" className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
          <h2 id="between" className="text-xl font-semibold">
            Between your last two tests
          </h2>
          <p>{between.story}</p>
          {between.summary.notes.length ? (
            <ul className="list-disc pl-5 text-sm text-muted">
              {between.summary.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          ) : null}
          {stats.length ? (
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {stats.map((s) => (
                <div key={s.label} className="rounded-xl bg-background p-3">
                  <dt className="text-[13px] font-semibold text-muted">{s.label}</dt>
                  <dd className="font-display text-xl font-semibold tabular-nums">{s.value}</dd>
                  <dd className="text-xs text-muted">{s.qualifier}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-muted">Weather for this pool has not loaded yet; the sun, heat and rain show here once it has.</p>
          )}
        </section>
      ) : null}
    </>
  );
}
