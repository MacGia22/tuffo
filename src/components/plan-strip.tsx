import { PLAN_MAX_ADDITION_PPM, PLAN_OWN_MODEL_PAIRS } from "@/engine/server";
import { catalogProduct } from "@/lib/catalog";
import { baseToShelf, formatShelf } from "@/lib/dose-format";
import type { Units } from "@/lib/format";
import { confidenceText, planHasFcLine, PLAN_TEST_AGE_DAYS, type StoredPlan, type StoredPlanDay } from "@/lib/plan/stored";

function weekday(date: string): { day: string; date: string } {
  const d = new Date(`${date}T12:00:00Z`);
  return {
    day: d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }),
    date: d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
  };
}

/** "1 qt", or null when there is nothing to add. */
export function planAddLabel(day: Pick<StoredPlanDay, "addMl">, units: Units): string | null {
  if (!(day.addMl > 0)) return null;
  const shelf = baseToShelf(day.addMl, "mL", units);
  return shelf.value > 0 ? formatShelf(shelf.value, shelf.unit) : null;
}

function rain(mm: number, units: Units): string {
  return units === "us" ? `${(mm / 25.4).toFixed(1)} in` : `${Math.round(mm)} mm`;
}

function dilutionText(day: StoredPlanDay): string | null {
  const d = day.dilution;
  if (!d) return null;
  const levels = [
    d.cya !== null ? `stabilizer about ${d.cya}` : null,
    d.ch !== null ? `calcium about ${d.ch}` : null,
    d.salt !== null ? `salt about ${d.salt}` : null,
  ].filter(Boolean);
  return `Heavy rain replaces about ${d.percent}% of the water${levels.length ? `: ${levels.join(", ")} ppm after` : ""}. Retest them after.`;
}

/**
 * This week: what to add each day (or where to set the salt cell), the chlorine the pool
 * is expected to use, and days to watch. Advice only; no model parameters.
 */
export function PlanStrip({
  plan,
  units,
  today,
  poolId,
  cellLevels = null,
  cellLowest = null,
}: {
  plan: StoredPlan;
  units: Units;
  today: string;
  poolId?: string;
  /** The settings the cell's control offers, as words: "25%, 50%, 75% or 100%". */
  cellLevels?: string | null;
  /** The cell's lowest setting, percent, when it has fixed ones. */
  cellLowest?: number | null;
}) {
  const { summary } = plan;
  const days = plan.days.filter((d) => d.date >= today).slice(0, 7);
  if (days.length === 0) return null;
  const product = catalogProduct(summary.product);
  const swg = summary.kind === "swg";
  const lowDay = summary.lowWithoutChlorine ? weekday(summary.lowWithoutChlorine) : null;
  const risky = days.filter((d) => d.algaeRisk);
  const fcLine = planHasFcLine(summary);
  const peak = Math.max(0, ...days.map((d) => d.fcEnd));
  // One line for today, above the week.
  const first = days[0].date === today ? days[0] : null;
  const firstAdd = first ? planAddLabel(first, units) : null;
  const todayLine = !first
    ? null
    : swg
      ? summary.swgPercent !== null
        ? `salt cell at ${summary.swgPercent}%${first.algaeRisk ? "; test, free chlorine may run low" : ""}.`
        : null
      : firstAdd
        ? `add ${firstAdd} of ${product ? product.name.toLowerCase() : "liquid chlorine"}${first.algaeRisk ? "; test first, it may run low" : ""}.`
        : "nothing to add.";

  return (
    <section aria-labelledby="plan" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="plan" className="text-xl font-semibold">
          This week
        </h2>
        <p className="text-sm text-muted">
          From the forecast for your pool. Tuffo advises; you decide.{" "}
          <a href="/app/account#alerts" className="font-semibold text-lagoon">
            Email me before a risky day
          </a>
        </p>
      </div>

      {todayLine ? (
        <p className="text-lg">
          <span className="font-semibold">Today:</span> {todayLine}
        </p>
      ) : null}

      {swg ? (
        <p className="rounded-2xl border border-border bg-surface p-4">
          {summary.swgPercent !== null ? (
            <>
              Set the salt cell to {cellLevels ? "" : "about "}
              <strong className="font-display text-lg">{summary.swgPercent}%</strong> this week{summary.cellHours ? ` (with the cell running ${summary.cellHours} h a day)` : ""}. It needs to make
              about {summary.swgNeedPpm?.toFixed(1)} ppm of free chlorine a day.
              {cellLevels ? ` Your cell sets ${cellLevels}; this is the lowest that keeps chlorine up all week.` : ""}
              {cellLowest !== null && summary.swgPercent === cellLowest && peak > summary.fc.targetHigh ? (
                <>
                  {" "}
                  Even at {cellLowest}% the cell makes more than this week should use, so free chlorine climbs to about{" "}
                  {peak.toFixed(0)} ppm. If a test shows it above {summary.fc.targetHigh} ppm, you can switch the cell off
                  for a day. If your tests keep coming in lower than Tuffo expected, it will learn that your pool uses more.
                </>
              ) : null}
              {summary.cellSetting !== summary.swgPercent && poolId ? (
                <>
                  {" "}
                  <a
                    href={`/app/pools/${poolId}/events/new?kind=cell_setting&value=${summary.swgPercent}`}
                    className="font-semibold text-lagoon"
                  >
                    I set it
                  </a>
                </>
              ) : null}
            </>
          ) : (
            <>
              The salt cell needs to make about <strong>{summary.swgNeedPpm?.toFixed(1)} ppm</strong> of free chlorine a
              day this week.{" "}
              {summary.cellNeeds === "pump" && poolId ? (
                <a href={`/app/pools/${poolId}/pump`} className="font-semibold text-lagoon">
                  Add the pump schedule
                </a>
              ) : (
                <a href="#salt-cell" className="font-semibold text-lagoon">
                  Add the cell&apos;s rated output
                </a>
              )}{" "}
              to get a setting in percent.
            </>
          )}
        </p>
      ) : null}

      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {days.map((d) => {
          const label = weekday(d.date);
          const add = planAddLabel(d, units);
          const dilution = dilutionText(d);
          return (
            <li
              key={d.date}
              aria-current={d.date === today ? "date" : undefined}
              className={`flex flex-col gap-1 rounded-2xl border p-3 text-sm ${
                d.algaeRisk ? "border-sun bg-sun/10" : d.date === today ? "border-lagoon bg-lagoon/5" : "border-border bg-surface"
              } ${d.date === today ? "ring-2 ring-lagoon/40" : ""}`}
            >
              <p className="text-xs font-semibold text-muted">
                {d.date === today ? <span className="text-lagoon">Today</span> : label.day} · {label.date}
              </p>
              {swg ? null : (
                <p className="font-display font-semibold">{add ? `Add ${add}` : "Nothing to add"}</p>
              )}
              <p className="text-xs text-muted">
                Uses about {d.lossPpm.toFixed(1)} ppm{d.estimated ? " (no forecast; average)" : ""}
              </p>
              {fcLine ? <p className="text-xs text-muted">≈{d.fcEnd.toFixed(1)} ppm by evening</p> : null}
              {d.rainMm >= 1 ? <p className="text-xs text-muted">Rain {rain(d.rainMm, units)}</p> : null}
              {d.algaeRisk ? (
                <p className="text-xs font-semibold">Algae risk: below {summary.fc.min} ppm</p>
              ) : null}
              {dilution ? <p className="text-xs">{dilution}</p> : null}
            </li>
          );
        })}
      </ol>

      <ul className="flex flex-col gap-1 text-xs text-muted">
        <li>{confidenceText(summary, PLAN_OWN_MODEL_PAIRS)}</li>
        <li>
          Keeps free chlorine at {summary.floor.toFixed(1)} ppm or more at the end of each day (target{" "}
          {summary.fc.targetLow}–{summary.fc.targetHigh}, never below {summary.fc.min}).
          {!swg && product ? ` Amounts are ${product.name.toLowerCase()}.` : ""}
        </li>
        {summary.daysSinceTest > PLAN_TEST_AGE_DAYS ? (
          <li className="font-semibold text-foreground">
            Your last free chlorine test was {Math.round(summary.daysSinceTest)} days ago, so the plan starts from an
            estimate. Test to sharpen it.
          </li>
        ) : null}
        {summary.capped || risky.length > 0 ? (
          <li className="font-semibold text-foreground">
            {swg
              ? "Even at 100% the cell may not keep up this week; top up with liquid chlorine on the flagged days."
              : `The plan stops at ${PLAN_MAX_ADDITION_PPM} ppm in one addition; on the flagged days, test and add more if free chlorine is low.`}
          </li>
        ) : null}
        {!swg && lowDay ? (
          <li>
            Without chlorine, free chlorine would fall below {summary.fc.min} ppm by {lowDay.day === weekday(today).day ? "tonight" : lowDay.day}.
          </li>
        ) : null}
        {!swg ? (
          <li>Add chlorine in the evening with the pump running, away from the skimmer, and never mix it with other products.</li>
        ) : null}
      </ul>
    </section>
  );
}
