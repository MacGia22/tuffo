import type { DueDay, LifeSpan, Tone } from "@/lib/maintenance";

/**
 * Maintenance pictures, following the chart rules in trend-chart.tsx: status colours
 * only with an icon and a word, thin marks on hairline tracks, one scale per chart, a
 * table or list view for each, and focusable marks with their values.
 */

const FILL: Record<Tone, string> = {
  good: "bg-status-good",
  warning: "bg-status-warning",
  critical: "bg-status-critical",
};

const TONE_LABEL: Record<Tone, string> = { good: "OK", warning: "Due soon", critical: "Overdue" };

export function ToneIcon({ tone, className = "h-3.5 w-3.5" }: { tone: Tone; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {tone === "good" ? <path d="m5 12 5 5 9-10" /> : null}
      {tone === "warning" ? (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v6M12 17h.01" />
        </>
      ) : null}
      {tone === "critical" ? (
        <>
          <path d="M12 3 2 20h20L12 3z" />
          <path d="M12 10v4M12 17h.01" />
        </>
      ) : null}
    </svg>
  );
}

export function TonePill({ tone, label = TONE_LABEL[tone] }: { tone: Tone; label?: string }) {
  const bg = tone === "good" ? "bg-status-good/15" : tone === "warning" ? "bg-status-warning/25" : "bg-status-critical/15";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold text-foreground ${bg}`}>
      <ToneIcon tone={tone} />
      {label}
    </span>
  );
}

/** How much of a task's interval has gone by: a thin bar, with the share in words. */
export function IntervalBar({ share, tone, text }: { share: number; tone: Tone; text: string }) {
  const pct = Math.round(Math.min(1, share) * 100);
  return (
    <div
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-valuetext={text}
      className="h-2 w-full overflow-hidden rounded-full bg-chart-grid"
    >
      <div className={`h-full rounded-full ${FILL[tone]}`} style={{ width: `${Math.max(pct, 3)}%` }} />
    </div>
  );
}

function short(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** The next 30 days, a dot on each day something falls due; a list view below. */
export function DueStrip({ days }: { days: DueDay[] }) {
  const busy = days.filter((d) => d.tasks.length > 0);
  return (
    <div className="flex flex-col gap-2">
      <ol className="grid grid-cols-[repeat(30,minmax(0,1fr))] gap-px" aria-label="Next 30 days">
        {days.map((d, i) => {
          const overdue = d.tasks.some((t) => t.overdue);
          const label = `${i === 0 ? "Today" : short(d.date)}: ${d.tasks.length ? d.tasks.map((t) => `${t.label}${t.overdue ? " (overdue)" : ""}`).join(", ") : "nothing due"}`;
          const first = i === 0 || d.date.endsWith("-01");
          return (
            <li
              key={d.date}
              tabIndex={d.tasks.length ? 0 : -1}
              aria-label={label}
              title={label}
              className="flex flex-col items-center gap-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-lagoon"
            >
              <span className={`text-[10px] leading-none ${first ? "text-muted" : "text-transparent"}`} aria-hidden="true">
                {i === 0 ? "Today" : first ? short(d.date).split(" ")[0] : "·"}
              </span>
              <span
                aria-hidden="true"
                className={`flex h-6 w-full items-center justify-center rounded-sm ${i === 0 ? "bg-lagoon/10 ring-1 ring-lagoon/50" : "bg-chart-grid/50"}`}
              >
                {d.tasks.length ? (
                  <span
                    className={`block h-2.5 w-2.5 rounded-full ring-2 ring-surface ${overdue ? "bg-status-critical" : "bg-status-warning"}`}
                  />
                ) : null}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-status-critical" aria-hidden="true" /> Overdue (shown on today)
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-status-warning" aria-hidden="true" /> Falls due
        </span>
      </p>
      <details className="text-sm">
        <summary className="cursor-pointer font-semibold text-lagoon">Show as a list</summary>
        {busy.length === 0 ? (
          <p className="mt-2 text-muted">Nothing falls due in the next 30 days.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1">
            {busy.map((d) => (
              <li key={d.date}>
                <span className="font-semibold">{d.date === days[0].date ? "Today" : short(d.date)}:</span>{" "}
                {d.tasks.map((t) => `${t.label}${t.overdue ? " (overdue)" : ""}`).join(", ")}
              </li>
            ))}
          </ul>
        )}
      </details>
    </div>
  );
}

const LIFE_TONE = { fine: "good", late: "warning", past: "critical" } as const;

/**
 * An item's life: a bar from install to the end of its typical life, the usual
 * replacement window shaded, today marked. `share` and window are relative to the end.
 */
export function LifeBar({ span, label }: { span: LifeSpan; label: string }) {
  const end = span.high * 1.2;
  const pos = (years: number) => `${Math.min(100, (years / end) * 100)}%`;
  const tone = LIFE_TONE[span.state];
  return (
    <div className="flex flex-col gap-1">
      <div
        role="meter"
        aria-valuemin={0}
        aria-valuemax={span.high}
        aria-valuenow={Math.round(span.ageYears * 10) / 10}
        aria-valuetext={`${label}: ${span.left}`}
        className="relative h-3 w-full rounded-full bg-chart-grid"
      >
        <div
          className="absolute inset-y-0 rounded-sm bg-status-warning/30"
          style={{ left: pos(span.low), width: `calc(${pos(span.high)} - ${pos(span.low)})` }}
          aria-hidden="true"
        />
        <div className={`absolute inset-y-0 left-0 rounded-full ${FILL[tone]}`} style={{ width: pos(span.ageYears) }} aria-hidden="true" />
        <div
          className="absolute -inset-y-1 w-0.5 rounded bg-foreground"
          style={{ left: `calc(${pos(span.ageYears)} - 1px)` }}
          aria-hidden="true"
        />
      </div>
      <div className="flex justify-between text-[11px] text-muted" aria-hidden="true">
        <span>Installed</span>
        <span>
          Typical replacement {span.low}–{span.high} yr
        </span>
      </div>
    </div>
  );
}

/** Hours used against the rated hours. */
export function HoursBar({ used, rated }: { used: number; rated: number }) {
  const share = used / rated;
  const tone: Tone = share > 1 ? "critical" : share >= 0.8 ? "warning" : "good";
  return (
    <IntervalBar
      share={share}
      tone={tone}
      text={`${used.toLocaleString("en-US")} of ${rated.toLocaleString("en-US")} hours (${Math.round(share * 100)}%)`}
    />
  );
}

export { TONE_LABEL };
export { PressureChart } from "./pressure-chart";

export interface HealthItem {
  label: string;
  /** Life used, 0–1+ (hours against the rating, or age against the typical life). */
  share: number;
  tone: Tone;
  text: string;
}

/** One compact row of mini life bars, linking to the maintenance page. */
export function HealthRow({ items, href }: { items: HealthItem[]; href: string }) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="health" className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="health" className="text-base font-semibold">
          Equipment health
        </h2>
        <a href={href} className="text-sm font-semibold text-lagoon">
          Details
        </a>
      </div>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        {items.map((item) => (
          <li key={item.label} className="flex flex-col gap-1 text-xs">
            <span className="flex items-center justify-between gap-1">
              <span className="font-semibold">{item.label}</span>
              <span className="inline-flex items-center gap-0.5 text-muted">
                <ToneIcon tone={item.tone} className="h-3 w-3" />
                {Math.round(item.share * 100)}%
              </span>
            </span>
            <IntervalBar share={item.share} tone={item.tone} text={`${item.label}: ${item.text}`} />
            <span className="text-muted">{item.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
