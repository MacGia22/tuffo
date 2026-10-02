import { PLAN_MAX_ADDITION_PPM } from "@/engine/server";
import { DayCard } from "@/components/day-card";
import { WaitlistForm } from "@/components/waitlist-form";
import type { ForecastInput } from "@/lib/forecast/params";
import type { ForecastDayView, ForecastView } from "@/lib/forecast/view";
import { AdjustOnMap } from "./adjust-map";
import { ChangeLink } from "./change-link";
import { CopyLink } from "./copy-link";

/** A forecast week as the page shows it (also used by the local design preview). */
export function Result({
  input,
  view,
  notices,
  shareHref,
  trackHref,
  open,
}: {
  input: ForecastInput;
  view: ForecastView;
  notices: string[];
  shareHref: string;
  trackHref: string;
  open: boolean;
}) {
  const salt = view.salt;
  const lowDay = view.lowWithoutChlorine ? view.days.find((d) => d.date === view.lowWithoutChlorine) : null;
  const range = view.useLow === view.useHigh ? `${view.useLow}` : `${view.useLow}–${view.useHigh}`;
  const assumptions = [
    view.volume,
    salt ? "salt cell" : "liquid chlorine 12.5%",
    `stabilizer ${view.cya} ppm`,
    salt ? null : `starting at ${view.startPpm} ppm`,
  ].filter(Boolean);

  return (
    <section aria-labelledby="week" className="flex flex-col gap-5">
      {notices.length > 0 ? (
        <ul role="status" className="flex flex-col gap-1 rounded-xl border border-chip-warn-fg/40 bg-chip-warn-bg px-4 py-3 text-sm text-chip-warn-fg">
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
          About <strong>{range} ppm a day</strong>.{" "}
          {lowDay ? (
            <>
              Without chlorine it falls below {view.target.min} ppm by <strong>{lowDay.dayLong}</strong>.
            </>
          ) : null}
        </p>
        {view.why ? <p className="text-muted">{view.why}</p> : null}
        {/* Keyed by the town: Next keeps client state across search-param changes, and a new
            town must start a new map (picking a square on it keeps the town). */}
        <AdjustOnMap key={input.place} input={input} />
      </div>

      <p className="rounded-xl border border-border bg-surface px-4 py-1 text-sm">
        {assumptions.join(" · ")} · <ChangeLink target="pool-details" />
      </p>

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

      <div className="flex flex-col gap-2">
        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {view.days.map((d) => (
            <ForecastDay key={d.date} day={d} salt={Boolean(salt)} min={view.target.min} />
          ))}
        </ol>
        {view.weekAdd ? (
          <p className="text-sm font-semibold">
            This week ≈ {view.weekAdd} of 12.5% chlorine
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 rounded-2xl bg-navy px-6 py-6 text-white">
        <p>
          <strong>Save this pool:</strong> Tuffo learns from your tests and emails you before chlorine runs low. This
          week is for a typical pool; after about 4 tests the plan is your pool&apos;s own.
        </p>
        {open ? (
          <a
            href={trackHref}
            className="inline-flex min-h-11 items-center self-start rounded-xl bg-white px-5 py-3 text-base font-semibold text-navy hover:bg-ice"
          >
            Save my pool, free
          </a>
        ) : (
          <div className="flex flex-col gap-2 text-foreground [&_p]:text-white">
            <p className="text-sm">Tuffo is in private beta. Leave your email to hear when it opens.</p>
            <WaitlistForm />
          </div>
        )}
      </div>

      <details className="text-sm">
        <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-lagoon">Table view</summary>
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
                {salt ? null : <th scope="col" className="py-1 pr-3">Add (12.5%)</th>}
              </tr>
            </thead>
            <tbody>
              {view.days.map((d) => (
                <tr key={d.date} className="border-t border-border">
                  <th scope="row" className="py-1 pr-3 font-semibold">
                    {d.today ? "Today" : d.day} {d.label}
                  </th>
                  <td className="py-1 pr-3">{d.uv ?? "–"}</td>
                  <td className="py-1 pr-3">{d.high ?? "–"}</td>
                  <td className="py-1 pr-3">{d.rainNote}</td>
                  <td className="py-1 pr-3">{d.useText}</td>
                  {salt ? null : <td className="py-1 pr-3">{d.add ?? "nothing"}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <ul className="flex flex-col gap-1 text-sm text-muted">
        {!salt && view.capped ? <li>One addition stops at {PLAN_MAX_ADDITION_PPM} ppm; test and add more if free chlorine is low.</li> : null}
        {!salt ? (
          <>
            <li>
              Amounts keep free chlorine above {view.target.min} ppm. With 10% chlorine, add a quarter more.
            </li>
            <li>Add chlorine in the evening with the pump running, away from the skimmer, and never mix it with other products.</li>
          </>
        ) : null}
        <li className="font-semibold text-foreground">Tuffo advises; you decide. Test before you add.</li>
      </ul>

      <CopyLink href={shareHref} />
    </section>
  );
}

function ForecastDay({ day, salt, min }: { day: ForecastDayView; salt: boolean; min: number }) {
  return (
    <DayCard
      day={day.today ? "Today" : day.day}
      dateText={day.label}
      today={day.today}
      ahead={!day.today}
      risk={day.algaeRisk ? `Algae risk: below ${min} ppm` : null}
      actions={[salt ? `Cell needs ${day.usePpm} ppm` : day.add ? `Add ${day.add} of 12.5% chlorine` : "Nothing to add"]}
      fc={day.fcEvening}
      uv={day.uv}
      rain={day.rainNote}
    >
      <p className="text-xs text-muted">
        High {day.high ?? "–"}
        {salt ? "" : ` · sun and heat use ≈ ${day.useText}`}
      </p>
      {day.dilutionPercent !== null ? (
        <p className="text-xs">
          Heavy rain replaces about {day.dilutionPercent}% of the water
          {day.cyaAfter !== null ? `: stabilizer about ${day.cyaAfter} ppm after` : ""}.
        </p>
      ) : null}
    </DayCard>
  );
}
