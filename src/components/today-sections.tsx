import Link from "next/link";
import { DayCard } from "@/components/day-card";
import type { ReactNode } from "react";
import type { TestStatus, TodayAction, WeekCard } from "@/lib/today";

const primary =
  "inline-flex min-h-11 items-center justify-center rounded-xl bg-action px-4 text-sm font-semibold text-white hover:bg-action-deep";
const secondary =
  "inline-flex min-h-11 items-center justify-center rounded-xl border border-lagoon px-4 text-sm font-semibold text-lagoon hover:bg-lagoon/10";

/** "Tested 5 days ago" with when and how, and the button to log the next test; a warning after a week. */
export function TestStatusCard({ status, logHref }: { status: TestStatus; logHref: string }) {
  return (
    <section
      aria-label="Last test"
      role={status.due ? "status" : undefined}
      className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 ${
        status.due ? "border-chip-warn-fg/40 bg-chip-warn-bg text-chip-warn-fg" : "border-border bg-surface"
      }`}
    >
      <div>
        <p className="font-display text-lg font-semibold">{status.title}</p>
        <p className={`text-sm ${status.due ? "" : "text-muted"}`}>{status.detail}</p>
      </div>
      {/* Filled only when it is time to test: the first action below is the page's one filled button. */}
      <Link href={logHref} className={status.due ? primary : secondary}>
        Log a test
      </Link>
    </section>
  );
}

const PILL: Record<"first" | "warn" | "critical" | "plain", string> = {
  first: "bg-action text-white",
  warn: "bg-chip-warn-fg text-chip-warn-bg",
  critical: "bg-chip-critical-fg text-chip-critical-bg",
  plain: "bg-chip-none-bg text-chip-none-fg",
};

/** The first card: lagoon, unless it is a warning (amber) or critical (red). */
const FIRST: Record<"first" | "warn" | "critical", string> = {
  first: "border-lagoon bg-lagoon/10",
  warn: "border-chip-warn-fg/40 bg-chip-warn-bg",
  critical: "border-chip-critical-border bg-chip-critical-bg",
};

function Pill({ text, tone }: { text: string; tone: keyof typeof PILL }) {
  return (
    <span className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${PILL[tone]}`}>
      {text}
    </span>
  );
}

/**
 * The most urgent action as a highlighted card with the button that logs it, the rest as
 * plain cards with when. `taskForms` holds the "Done" form for maintenance actions.
 */
export function WhatToDoNow({
  actions,
  assumptions,
  taskForms,
}: {
  actions: TodayAction[];
  assumptions: string[];
  taskForms: Record<string, ReactNode>;
}) {
  const [first, ...rest] = actions;
  return (
    <section id="actions" aria-labelledby="actions-title" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="actions-title" className="text-xl font-semibold">
          What to do now
        </h2>
        <p className="text-sm text-muted">Tuffo advises; you decide.</p>
      </div>
      {!first ? (
        <p className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">Nothing to do now.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {[first, ...rest].map((a, i) => (
            <li
              key={a.id}
              className={`flex flex-col gap-2 rounded-2xl border p-4 ${
                i === 0 ? FIRST[a.tone ?? "first"] : a.tone === "critical" ? "border-chip-critical-border bg-surface" : "border-border bg-surface"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className={`font-sans font-semibold ${i === 0 ? "text-lg" : "text-base"}`}>{a.title}</h3>
                <Pill text={a.pill} tone={a.tone ?? (i === 0 ? "first" : "plain")} />
              </div>
              <p className="text-sm text-muted">{a.why}</p>
              {a.notes ? (
                <ul className="list-disc pl-5 text-xs text-muted">
                  {a.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              ) : null}
              {a.button ? (
                <Link
                  href={a.button.href}
                  className={
                    i === 0
                      ? `${primary} self-start`
                      : "inline-flex min-h-11 items-center self-start rounded-xl border border-lagoon px-4 text-sm font-semibold text-lagoon hover:bg-lagoon/10"
                  }
                >
                  {a.button.label}
                </Link>
              ) : null}
              {a.task ? taskForms[a.task.id] : null}
            </li>
          ))}
        </ul>
      )}
      {assumptions.length ? (
        <ul className="list-disc pl-5 text-xs text-muted">
          {assumptions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/** The week from today as a row of day cards that scrolls sideways. */
export function NextSevenDays({ cards, children }: { cards: WeekCard[]; children?: ReactNode }) {
  return (
    <section id="plan" aria-labelledby="plan-title" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="plan-title" className="text-xl font-semibold">
          Next 7 days
        </h2>
        <a href="/app/account#alerts" className="text-sm font-semibold text-lagoon">
          Email me before a risky day
        </a>
      </div>
      <ol className="-mx-5 flex snap-x gap-2 overflow-x-auto px-5 pb-1 sm:mx-0 sm:px-0">
        {cards.map((c) => (
          <DayCard
            key={c.date}
            day={c.day}
            dateText={c.dateText}
            today={c.today}
            ahead={!c.today}
            risk={c.risk ? "May run low" : null}
            actions={c.actions}
            fc={c.fc}
            uv={c.uv?.index ?? null}
            rain={c.rain}
            className="w-28 shrink-0 snap-start lg:w-auto lg:flex-1"
          />
        ))}
      </ol>
      {children}
    </section>
  );
}

/** The link to the Trends page. */
export function TrendsLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="flex min-h-11 items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4 hover:border-lagoon"
    >
      <span>
        <span className="block font-semibold">Trends: chlorine, pH, sun and rain</span>
        <span className="text-sm text-muted">Your tests, the estimate since the last one, and the plan for the week</span>
      </span>
      <span aria-hidden="true" className="text-xl text-lagoon">
        →
      </span>
    </Link>
  );
}
