import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { TuffoLockup } from "@/components/brand/logo";
import { signupSource } from "@/lib/beta";
import { serverEnv } from "@/lib/env";
import { buildPublicForecast, type ForecastResult } from "@/lib/forecast/build";
import { allowForecast } from "@/lib/forecast/limits";
import { forecastHref, parseForecastParams, signupHref, type ForecastInput } from "@/lib/forecast/params";
import { isBotAgent } from "@/lib/ref-visits";
import { countRefVisit } from "@/lib/ref-visits-store";
import { ForecastForm } from "./forecast-form";
import { Result } from "./result";

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
        <Link href="/login" className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-lagoon hover:underline">
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
          <p role="alert" className="rounded-xl border border-chip-warn-fg/40 bg-chip-warn-bg text-chip-warn-fg px-4 py-3 text-sm">
            That link is missing its town. Search for the town again.
          </p>
        ) : null}
        {outcome.kind === "limited" ? (
          <p role="alert" className="rounded-xl border border-chip-warn-fg/40 bg-chip-warn-bg text-chip-warn-fg px-4 py-3 text-sm">
            Too many forecasts from your connection in the last few minutes. Try again in a little while.
          </p>
        ) : null}
        {outcome.kind === "failed" ? (
          <p role="alert" className="rounded-xl border border-chip-warn-fg/40 bg-chip-warn-bg text-chip-warn-fg px-4 py-3 text-sm">
            The weather forecast is not answering right now. Try again in a moment.
          </p>
        ) : null}

        {outcome.kind === "ok" ? (
          <Result
            input={outcome.input}
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
