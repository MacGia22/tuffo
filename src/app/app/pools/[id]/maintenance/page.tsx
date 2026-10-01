import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PoolCrumbs } from "@/components/pool-crumbs";
import { describeEquipment, KIND_LABELS } from "@/lib/equipment";
import { formatPressure, type Units } from "@/lib/format";
import { isUuid } from "@/lib/form-data";
import {
  ageYears,
  describeInterval,
  dueText,
  formatAge,
  hoursLife,
  lifeState,
  PRESSURE_RISE_KPA,
  taskById,
  TYPICAL_LIFE_YEARS,
  type LifeState,
  type TaskState,
} from "@/lib/maintenance";
import { loadPoolMaintenance } from "@/lib/maintenance-data";
import { cellRatedHours } from "@/lib/salt-cells";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { deleteMaintenance, deletePressure } from "./actions";
import { CellInstalledForm, DoneForm, IntervalForm, PressureForm } from "./maintenance-forms";

export const metadata: Metadata = { title: "Maintenance" };

function day(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

const STATE_STYLE: Record<TaskState, string> = {
  overdue: "border-red-300 bg-red-50/60",
  due: "border-sun/70 bg-sun/10",
  soon: "border-lagoon/40 bg-lagoon/5",
  ok: "border-border bg-surface",
  unknown: "border-border bg-surface",
};

const LIFE_TEXT: Record<LifeState, string> = {
  fine: "within a typical life",
  late: "in the later part of a typical life: worth budgeting for a replacement",
  past: "past a typical life: keep an eye on it",
};

function lifeKey(kind: string, type: string | null): string {
  return kind === "heater" ? `heater_${type ?? "gas"}` : kind;
}

export default async function MaintenancePage({ params }: PageProps<"/app/pools/[id]/maintenance">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const supabase = await createSupabaseServerClient();
  const [{ data: pool }, { data: profile }] = await Promise.all([
    supabase.from("pools").select("id, name").eq("id", id).maybeSingle<{ id: string; name: string }>(),
    supabase.from("profiles").select("units").maybeSingle<{ units: Units }>(),
  ]);
  if (!pool) notFound();
  const units = profile?.units ?? "us";
  const m = await loadPoolMaintenance(supabase, pool.id, { cellHours: true });
  const settingsHref = `/app/pools/${pool.id}/settings`;
  const link = "font-semibold text-lagoon underline-offset-2 hover:underline";

  if (!m) {
    return (
      <>
        <PoolCrumbs poolId={pool.id} poolName={pool.name} here="Maintenance" />
        <h1 className="text-3xl font-semibold">Maintenance</h1>
        <p className="text-muted">Maintenance is not available yet. Try again in a few minutes.</p>
      </>
    );
  }

  const filter = m.equipment.find((e) => e.kind === "filter") ?? null;
  const pressureTasks = m.statuses.some((s) => s.task.pressure);
  const ratedHours = m.cell ? cellRatedHours(m.cell.model) : null;
  const cellUsed = m.cell?.hours && ratedHours ? hoursLife(m.cell.hours.hours, ratedHours) : null;

  return (
    <>
      <PoolCrumbs poolId={pool.id} poolName={pool.name} here="Maintenance" />
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">Maintenance</h1>
        <p className="text-muted">
          Routine upkeep for the equipment in{" "}
          <Link href={settingsHref} className={link}>
            Settings
          </Link>
          , at typical intervals. Change any of them to match your manuals and how your pool runs. For a reminder by
          email, switch on maintenance reminders under{" "}
          <Link href="/app/account#alerts" className={link}>
            Email alerts
          </Link>
          .
        </p>
      </div>

      <section aria-labelledby="tasks" className="flex flex-col gap-3">
        <h2 id="tasks" className="text-xl font-semibold">
          Tasks
        </h2>
        {m.statuses.length === 0 ? (
          <p className="text-sm">
            No tasks yet: add your pump, filter, heater or feeder in{" "}
            <Link href={settingsHref} className={link}>
              Settings
            </Link>
            .
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {m.statuses.map((s) => (
              <li key={s.task.id} className={`flex flex-col gap-2 rounded-2xl border p-4 ${STATE_STYLE[s.state]}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-semibold">{s.task.label}</h3>
                  <p className={`text-sm ${s.state === "overdue" ? "font-semibold text-red-700" : ""}`}>{dueText(s)}</p>
                </div>
                <p className="text-sm">
                  {s.lastDone ? `Last done ${day(s.lastDone)}` : "Not logged yet: if you did it recently, log the day"}
                  {" · "}
                  {describeInterval(s.intervalDays)}
                  {s.intervalDays !== s.task.defaultDays
                    ? " (your setting)"
                    : s.task.typical === describeInterval(s.intervalDays)
                      ? " (typical)"
                      : ` (typical: ${s.task.typical})`}
                </p>
                <p className="text-xs text-muted">{s.task.how}</p>
                <DoneForm poolId={pool.id} task={s.task.id} taskLabel={s.task.label} withDate />
                <IntervalForm
                  poolId={pool.id}
                  task={s.task.id}
                  days={s.intervalDays}
                  defaultDays={s.task.defaultDays}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {filter ? (
        <section aria-labelledby="pressure" className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
          <h2 id="pressure" className="text-xl font-semibold">
            Filter pressure
          </h2>
          {m.pressure ? (
            <p className="text-sm">
              Now <strong>{formatPressure(m.pressure.latest.kpa, units)}</strong> ({day(m.pressure.latest.readOn)})
              {m.pressure.clean ? (
                <>
                  {" · "}clean <strong>{formatPressure(m.pressure.clean.kpa, units)}</strong> (
                  {day(m.pressure.clean.readOn)})
                  {m.pressure.riseKpa !== null && m.pressure.riseKpa > 0 ? (
                    <>
                      {" · "}up <strong>{formatPressure(m.pressure.riseKpa, units)}</strong>
                    </>
                  ) : null}
                </>
              ) : (
                <> · no clean pressure yet: log one right after the next cleaning</>
              )}
              .
              {m.pressure.high ? (
                <span className="font-semibold"> Time to clean the filter.</span>
              ) : null}
            </p>
          ) : (
            <p className="text-sm">
              No readings yet. Log the gauge right after cleaning (the clean pressure), then now and then: Tuffo marks
              the filter due when it reads about {formatPressure(PRESSURE_RISE_KPA, units)} over clean.
            </p>
          )}
          {!pressureTasks ? null : (
            <p className="text-xs text-muted">
              Cleaning when the pressure is {units === "us" ? "8 to 10 psi" : "0.5 to 0.7 bar"} over clean is the usual
              rule; a much lower reading than clean can mean a blocked skimmer or pump basket.
            </p>
          )}
          <PressureForm poolId={pool.id} units={units} />
          {m.readings.length > 0 ? (
            <ul className="flex flex-col gap-1 text-sm">
              {m.readings.slice(0, 8).map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2">
                  {day(r.readOn)}: {formatPressure(r.kpa, units)}
                  {r.clean ? <span className="text-muted">(clean)</span> : null}
                  <form action={deletePressure}>
                    <input type="hidden" name="pool_id" value={pool.id} />
                    <input type="hidden" name="id" value={r.id} />
                    <button type="submit" className="text-xs text-muted underline-offset-2 hover:underline">
                      Remove
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <section aria-labelledby="life" className="flex flex-col gap-3">
        <h2 id="life" className="text-xl font-semibold">
          Equipment life
        </h2>
        <p className="text-sm text-muted">
          Rough guides from makers&apos; ratings and typical service lives. Water chemistry, run hours and climate
          make a big difference either way.
        </p>
        <ul className="flex flex-col gap-3">
          {m.cell ? (
            <li className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4 text-sm">
              <h3 className="font-semibold">Salt cell{m.cell.model && m.cell.model !== "Other" ? `: ${m.cell.model}` : ""}</h3>
              {!m.cell.installedOn ? (
                <p>Add the day the cell was installed to see how much of its life it has used.</p>
              ) : m.cell.hours ? (
                <>
                  <p>
                    About <strong>{m.cell.hours.hours.toLocaleString("en-US")} hours</strong> of making chlorine since{" "}
                    {day(m.cell.installedOn)}
                    {ratedHours && cellUsed ? (
                      <>
                        {" "}
                        of the {ratedHours.toLocaleString("en-US")} the maker rates it for (
                        <strong>{cellUsed.percent}%</strong>): {LIFE_TEXT[cellUsed.state]}.
                      </>
                    ) : (
                      <>. The maker does not publish a rated life in hours for this cell.</>
                    )}
                  </p>
                  <p className="text-xs text-muted">
                    Counted from your pump schedules and cell settings (a cell at 50% makes chlorine about half the
                    time it runs)
                    {m.cell.hours.extrapolated
                      ? "; before your first logged schedule, Tuffo assumes that schedule"
                      : ""}
                    . Low salt, scale and cold water shorten a cell&apos;s life.
                  </p>
                </>
              ) : (
                <p>
                  Installed {day(m.cell.installedOn)} ({formatAge(ageYears(m.cell.installedOn, m.today))}).{" "}
                  <Link href={`/app/pools/${pool.id}/pump`} className={link}>
                    Add the pump schedule
                  </Link>{" "}
                  to count its hours.
                </p>
              )}
              {m.cell.installedOn && !ratedHours ? (
                <p>
                  Typical life {TYPICAL_LIFE_YEARS.cell[0]} to {TYPICAL_LIFE_YEARS.cell[1]} years; this one is{" "}
                  {formatAge(ageYears(m.cell.installedOn, m.today))} old,{" "}
                  {LIFE_TEXT[lifeState(ageYears(m.cell.installedOn, m.today), TYPICAL_LIFE_YEARS.cell)]}.
                </p>
              ) : null}
              <CellInstalledForm poolId={pool.id} installedOn={m.cell.installedOn} />
            </li>
          ) : null}
          {m.equipment.map((e) => {
            const life = TYPICAL_LIFE_YEARS[lifeKey(e.kind, e.type)];
            const years = ageYears(e.installedOn, m.today);
            return (
              <li key={e.kind} className="flex flex-col gap-1 rounded-2xl border border-border bg-surface p-4 text-sm">
                <h3 className="font-semibold">
                  {KIND_LABELS[e.kind]}: {describeEquipment(e.kind, e.model, e.details)}
                </h3>
                <p>
                  Installed {day(e.installedOn)} ({formatAge(years)})
                  {life ? (
                    <>
                      . Typical life {life[0]} to {life[1]} years: {LIFE_TEXT[lifeState(years, life)]}.
                    </>
                  ) : (
                    "."
                  )}
                </p>
                <p className="text-xs text-muted">
                  Wrong date?{" "}
                  <Link href={settingsHref} className={link}>
                    Change it in Settings
                  </Link>
                  .
                </p>
              </li>
            );
          })}
        </ul>
      </section>

      {m.history.length > 0 ? (
        <section aria-labelledby="done" className="flex flex-col gap-2">
          <h2 id="done" className="text-xl font-semibold">
            Done lately
          </h2>
          <ul className="flex flex-col gap-1 text-sm">
            {m.history.slice(0, 20).map((h) => (
              <li key={h.id} className="flex flex-wrap items-center gap-2">
                {day(h.doneOn)}: {taskById(h.task)?.label ?? h.task}
                <form action={deleteMaintenance}>
                  <input type="hidden" name="pool_id" value={pool.id} />
                  <input type="hidden" name="id" value={h.id} />
                  <button type="submit" className="text-xs text-muted underline-offset-2 hover:underline">
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
