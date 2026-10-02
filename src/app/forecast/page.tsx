import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { TuffoLockup } from "@/components/brand/logo";
import { PLAN_MAX_ADDITION_PPM } from "@/engine/server";
import { WaitlistForm } from "@/components/waitlist-form";
import { signupSource } from "@/lib/beta";
import { serverEnv } from "@/lib/env";
import { buildPublicForecast, type ForecastResult } from "@/lib/forecast/build";
import { allowForecast } from "@/lib/forecast/limits";
import { forecastHref, parseForecastParams, signupHref, type ForecastInput } from "@/lib/forecast/params";
import type { ForecastDayView, ForecastView } from "@/lib/forecast/view";
import { isBotAgent } from "@/lib/ref-visits";
import { countRefVisit } from "@/lib/ref-visits-store";
import { CopyLink } from "./copy-link";
import { ForecastForm } from "./forecast-form";

// Per request: the forecast depends on the query and the visitor's rate limit.
export const dynamic = "force-dynamic";

const TITLE = "Pool forecast: this week's chlorine for your town";
const DESCRIPTION =
  "Type your town or ZIP and see how much chlorine a typical pool will use each day this week, from the sun, heat and rain forecast. Free, no sign-up.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  // Results with a query string point search engines at the one page (city pages come later).
  alternates: { canonical: "/forecast" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/forecast" },
};

type Outcome =
  | { kind: "none" }
  | { kind: "bad-place" }
  | { kind: "limited"; input: ForecastInput }
  | { kind: "failed"; input: ForecastInput }
  | { kind: "ok"; input: ForecastInput; result: ForecastResult; notices: string[] };

export default async function ForecastPage({ searchParams }: PageProps<"/forecast">) {
  const params = await searchParams;
  const ref = signupSource(params.ref);
  const parsed = parseForecastParams(params);
  // A link with a precise point: send it on to the weather cell's center.
  if (parsed.ok && parsed.canonical) redirect(parsed.canonical);

  let outcome: Outcome = { kind: "none" };
  if (!parsed.ok) {
    outcome = parsed.reason === "bad-place" ? { kind: "bad-place" } : { kind: "none" };
  } else if (!(await allowForecast())) {
    outcome = { kind: "limited", input: parsed.input };
  } else {
    try {
      const result = await buildPublicForecast(parsed.input);
      outcome = result ? { kind: "ok", input: parsed.input, result, notices: parsed.notices } : { kind: "failed", input: parsed.input };
    } catch (error) {
      console.error(`[forecast] ${error instanceof Error ? error.message : "error"}`);
      outcome = { kind: "failed", input: parsed.input };
    }
  }

  if (outcome.kind === "ok") {
    // One "forecast" visit on the admin page per week shown to a person.
    const h = await headers();
    const prefetch = h.get("next-router-prefetch") !== null || /prefetch|prerender/i.test(`${h.get("purpose") ?? ""} ${h.get("sec-purpose") ?? ""}`);
    if (!prefetch && !isBotAgent(h.get("user-agent"))) after(() => countRefVisit("forecast"));
  }

  const current = outcome.kind === "none" || outcome.kind === "bad-place" ? null : outcome.input;
  const open = serverEnv.signupsOpen();

  return (
    <>
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5">
        <Link href="/" aria-label="Tuffo home">
          <TuffoLockup size={32} />
        </Link>
        <Link href="/login" className="text-sm font-semibold text-lagoon hover:underline">
          Sign in
        </Link>
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-5 pb-20 pt-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold sm:text-4xl">Your pool&apos;s week</h1>
          <p className="text-muted">
            How much chlorine a pool in your town will use each day this week, from the sun, heat and rain forecast. No
            sign-up.
          </p>
        </div>

        {outcome.kind !== "ok" ? <ForecastForm key="search" current={current} refLabel={ref} autoFocus={!current} /> : null}

        {outcome.kind === "bad-place" ? (
          <p role="alert" className="rounded-xl border border-sun/60 bg-sun/10 px-4 py-3 text-sm">
            That link is missing its town. Search for the town again.
          </p>
        ) : null}
        {outcome.kind === "limited" ? (
          <p role="alert" className="rounded-xl border border-sun/60 bg-sun/10 px-4 py-3 text-sm">
            Too many forecasts from your connection in the last few minutes. Try again in a little while.
          </p>
        ) : null}
        {outcome.kind === "failed" ? (
          <p role="alert" className="rounded-xl border border-sun/60 bg-sun/10 px-4 py-3 text-sm">
            The weather forecast is not answering right now. Try again in a moment.
          </p>
        ) : null}

        {outcome.kind === "ok" ? (
          <Result
            view={outcome.result.view}
            notices={outcome.notices}
            shareHref={forecastHref(outcome.input)}
            trackHref={signupHref(outcome.input, { ref, timezone: outcome.result.timezone })}
            open={open}
          />
        ) : null}

        {/* With a result on screen the week comes first; another town or the pool's numbers below it. */}
        {outcome.kind === "ok" ? <ForecastForm key={forecastHref(outcome.input)} current={outcome.input} refLabel={ref} /> : null}

        <p className="text-xs text-muted">
          Weather from{" "}
          <a href="https://open-meteo.com/" className="underline">
            Open-Meteo
          </a>
          . Tuffo keeps nothing about this search; the link holds only the town name and a weather area about 3 km (2
          miles) across. <Link href="/privacy" className="underline">Privacy</Link>
        </p>
      </main>
    </>
  );
}

function Result({
  view,
  notices,
  shareHref,
  trackHref,
  open,
}: {
  view: ForecastView;
  notices: string[];
  shareHref: string;
  trackHref: string;
  open: boolean;
}) {
  const salt = view.salt;
  const lowDay = view.lowWithoutChlorine ? view.days.find((d) => d.date === view.lowWithoutChlorine) : null;
  const scaleMax = Math.max(4, ...view.days.map((d) => d.usePpm));
  const range = view.useLow === view.useHigh ? `${view.useLow}` : `${view.useLow}–${view.useHigh}`;

  return (
    <section aria-labelledby="week" className="flex flex-col gap-5">
      {notices.length > 0 ? (
        <ul role="status" className="flex flex-col gap-1 rounded-xl border border-sun/60 bg-sun/10 px-4 py-3 text-sm">
          {notices.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-col gap-2">
        <h2 id="week" className="text-2xl font-semibold">
          {view.place}, week of {view.weekOfLabel}: chlorine use {view.level}
        </h2>
        <p className="text-lg">
          About <strong>{range} ppm a day</strong> for a {view.volume} {salt ? "salt" : "chlorine"} pool at stabilizer{" "}
          {view.cya} ppm.
        </p>
        {view.why ? <p className="text-muted">{view.why}</p> : null}
      </div>

      {salt ? (
        <p className="rounded-2xl border border-border bg-surface p-4">
          The salt cell needs to make about <strong>{salt.needPpm} ppm</strong> of free chlorine a day.{" "}
          {salt.percent !== null ? (
            <>
              For {salt.cell}, that is a setting of about <strong>{salt.percent}%</strong>
              {view.capped ? ", and even then it may not keep up: top up with liquid chlorine if a test is low" : ""}.
            </>
          ) : null}{" "}
          Your own cell&apos;s setting depends on its size and pump hours.
        </p>
      ) : null}

      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {view.days.map((d) => (
          <DayCard key={d.date} day={d} salt={Boolean(salt)} min={view.target.min} scaleMax={scaleMax} />
        ))}
      </ol>

      <details className="text-sm">
        <summary className="cursor-pointer font-semibold text-lagoon">Table view</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <caption className="sr-only">This week, day by day</caption>
            <thead className="text-xs text-muted">
              <tr>
                <th scope="col" className="py-1 pr-3">Day</th>
                <th scope="col" className="py-1 pr-3">Peak UV</th>
                <th scope="col" className="py-1 pr-3">High</th>
                <th scope="col" className="py-1 pr-3">Rain</th>
                <th scope="col" className="py-1 pr-3">Chlorine used</th>
                {salt ? null : <th scope="col" className="py-1 pr-3">Add</th>}
              </tr>
            </thead>
            <tbody>
              {view.days.map((d) => (
                <tr key={d.date} className="border-t border-border">
                  <th scope="row" className="py-1 pr-3 font-semibold">
                    {d.day} {d.label}
                  </th>
                  <td className="py-1 pr-3">{d.uv ?? "–"}</td>
                  <td className="py-1 pr-3">{d.high ?? "–"}</td>
                  <td className="py-1 pr-3">{d.rainfall ?? "none"}</td>
                  <td className="py-1 pr-3">{d.usePpm} ppm</td>
                  {salt ? null : <td className="py-1 pr-3">{d.add ?? "nothing"}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <ul className="flex flex-col gap-1 text-sm text-muted">
        {lowDay ? (
          <li>
            Without chlorine, a pool starting at {view.target.low} ppm falls below {view.target.min} ppm, where algae can
            start, by the end of {lowDay.dayLong}.
          </li>
        ) : null}
        {!salt && view.capped ? <li>One addition stops at {PLAN_MAX_ADDITION_PPM} ppm; test and add more if free chlorine is low.</li> : null}
        {!salt ? (
          <>
            <li>
              Amounts are liquid chlorine 12.5%, starting at {view.target.low} ppm and keeping it above {view.target.min}{" "}
              ppm. With 10% chlorine, add a quarter more.
            </li>
            <li>Add chlorine in the evening with the pump running, away from the skimmer, and never mix it with other products.</li>
          </>
        ) : null}
        <li className="font-semibold text-foreground">Tuffo advises; you decide. Test before you add.</li>
      </ul>

      <CopyLink href={shareHref} />

      <div className="flex flex-col gap-3 rounded-2xl bg-navy px-6 py-6 text-white">
        <p>
          This is a typical pool. Tuffo learns how fast <strong>your</strong> pool uses chlorine from your own tests (4
          pairs), then plans each day for it.
        </p>
        {open ? (
          <a
            href={trackHref}
            className="self-start rounded-xl bg-white px-5 py-3 text-base font-semibold text-navy hover:bg-ice"
          >
            Track my pool, free
          </a>
        ) : (
          <div className="flex flex-col gap-2 text-foreground [&_p]:text-white">
            <p className="text-sm">Tuffo is in private beta. Leave your email to hear when it opens.</p>
            <WaitlistForm />
          </div>
        )}
      </div>
    </section>
  );
}

function DayCard({ day, salt, min, scaleMax }: { day: ForecastDayView; salt: boolean; min: number; scaleMax: number }) {
  return (
    <li
      className={`flex flex-col gap-1 rounded-2xl border p-3 text-sm ${day.algaeRisk ? "border-sun bg-sun/10" : "border-border bg-surface"}`}
    >
      <p className="text-xs font-semibold text-muted">
        {day.day} · {day.label}
      </p>
      <p className="font-display font-semibold">
        {salt ? `Cell needs ${day.usePpm} ppm` : day.add ? `Add ${day.add}` : "Nothing to add"}
      </p>
      {salt ? null : <p className="text-xs text-muted">Uses about {day.usePpm} ppm</p>}
      <span aria-hidden="true" className="block h-1.5 w-full rounded-full bg-chart-grid">
        <span
          className="block h-1.5 rounded-full bg-chart-chem"
          style={{ width: `${Math.min(100, (day.usePpm / scaleMax) * 100)}%` }}
        />
      </span>
      <p className="text-xs text-muted">
        UV {day.uv ?? "–"} · {day.high ?? "–"}
        {day.rainfall ? ` · rain ${day.rainfall}` : ""}
      </p>
      {day.algaeRisk ? <p className="text-xs font-semibold">Algae risk: below {min} ppm</p> : null}
      {day.dilutionPercent !== null ? (
        <p className="text-xs">
          Heavy rain replaces about {day.dilutionPercent}% of the water
          {day.cyaAfter !== null ? `: stabilizer about ${day.cyaAfter} ppm after` : ""}.
        </p>
      ) : null}
    </li>
  );
}
