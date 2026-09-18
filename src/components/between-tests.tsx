import type { BetweenSummary } from "@/lib/weather/summary";
import { sunVerdict } from "@/lib/weather/summary";
import type { Units } from "@/lib/format";

function c(value: number, units: Units): string {
  return units === "us" ? `${Math.round((value * 9) / 5 + 32)} °F` : `${Math.round(value)} °C`;
}

function mm(value: number, units: Units): string {
  return units === "us" ? `${(value / 25.4).toFixed(value / 25.4 < 1 ? 2 : 1)} in` : `${value.toFixed(0)} mm`;
}

export function BetweenTests({ summary, units }: { summary: BetweenSummary; units: Units }) {
  const noWeather = summary.daysWithWeather === 0;
  return (
    <section aria-labelledby="between" className="rounded-2xl border border-border bg-surface p-5">
      <h2 id="between" className="text-xl font-semibold">
        Since your previous test
      </h2>
      <p className="mt-1 text-sm text-muted">
        {summary.days} {summary.days === 1 ? "day" : "days"} between the two tests
        {summary.fcLossPerDay !== null ? `; free chlorine fell about ${summary.fcLossPerDay.toFixed(1)} ppm per day` : ""}
        {summary.avgUvMax !== null ? ` under ${sunVerdict(summary.avgUvMax)}` : ""}.
      </p>
      {noWeather ? (
        <p className="mt-3 text-sm text-muted">
          Weather for this pool starts collecting with the next nightly update; from then on this box shows sun, heat
          and rain between tests.
        </p>
      ) : (
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {summary.avgUvMax !== null ? (
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-muted">Peak UV, avg</dt>
              <dd className="font-display text-xl font-semibold">{summary.avgUvMax.toFixed(1)}</dd>
            </div>
          ) : null}
          {summary.sunshineHours !== null ? (
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-muted">Sunshine</dt>
              <dd className="font-display text-xl font-semibold">{summary.sunshineHours.toFixed(0)} h</dd>
            </div>
          ) : null}
          {summary.avgTmaxC !== null ? (
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-muted">Daily high, avg</dt>
              <dd className="font-display text-xl font-semibold">{c(summary.avgTmaxC, units)}</dd>
            </div>
          ) : null}
          {summary.rainMm !== null ? (
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-muted">Rain</dt>
              <dd className="font-display text-xl font-semibold">{mm(summary.rainMm, units)}</dd>
            </div>
          ) : null}
        </dl>
      )}
    </section>
  );
}
