import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PoolCrumbs } from "@/components/pool-crumbs";
import { describeEquipment, KIND_LABELS } from "@/lib/equipment";
import { formatPressure, kpaToDisplayPressure, type Units } from "@/lib/format";
import { isUuid } from "@/lib/form-data";
import { fromParam } from "@/lib/return-to";
import {
  ageYears,
  cellReplacementMonth,
  describeInterval,
  dueCalendar,
  dueParts,
  groupTasks,
  statusTone,
  type TaskStatus,
  intervalProgress,
  lifeSpan,
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
import { LogList } from "./log-list";
import { DoneForm, IntervalForm, PressureForm, StartDateForm } from "./maintenance-forms";
import { DueStrip, HoursBar, IntervalBar, LifeBar, PressureChart, TonePill } from "@/components/maintenance-visuals";

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
  overdue: "border-red-300 bg-red-50/60 dark:border-red-900 dark:bg-red-950/40",
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
  const groups = groupTasks(m.statuses);
  const pressureTasks = m.statuses.some((s) => s.task.pressure);
  const ratedHours = m.cell ? cellRatedHours(m.cell.model) : null;
  const cellUsed = m.cell?.hours && ratedHours ? hoursLife(m.cell.hours.hours, ratedHours) : null;

  return (
    <>
      <PoolCrumbs poolId={pool.id} poolName={pool.name} here="Maintenance" />
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">Maintenance</h1>
        <p className="text-muted">
          Upkeep at typical intervals; change any to fit your pool.{" "}
          <Link href="/app/account#alerts" className={link}>
            Email reminders
          </Link>
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
          <>
            <DueStrip days={dueCalendar(m.statuses, m.today)} />
            {groups.start.length > 0 ? (
              <div className="flex flex-col gap-2">
                <h3 className="font-semibold">Set a starting date</h3>
                <p className="text-sm text-muted">When did you last do these? Reminders start from that day.</p>
                <ul className="flex flex-col gap-3">
                  {groups.start.map((s) => (
                    <li key={s.task.id} className="flex flex-col gap-2 rounded-2xl border border-dashed border-border bg-surface p-4">
                      <div className="flex items-start gap-3">
                        <h4 className="min-w-0 flex-1 font-semibold">{s.task.label}</h4>
                        <p className="shrink-0 text-right text-xs text-muted">{describeInterval(s.intervalDays)}</p>
                      </div>
                      <StartDateForm poolId={pool.id} task={s.task.id} taskLabel={s.task.label} today={m.today} />
                      <HowTo text={s.task.how} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {groups.soon.length > 0 ? (
              <ul className="flex flex-col gap-3">
                {groups.soon.map((s) => (
                  <TaskCard key={s.task.id} s={s} poolId={pool.id} today={m.today} />
                ))}
              </ul>
            ) : null}
            {groups.later.length > 0 ? (
              <details className="rounded-2xl border border-border bg-surface p-4">
                <summary className="cursor-pointer font-semibold">Later ({groups.later.length})</summary>
                <ul className="mt-3 flex flex-col gap-3">
                  {groups.later.map((s) => (
                    <TaskCard key={s.task.id} s={s} poolId={pool.id} today={m.today} />
                  ))}
                </ul>
              </details>
            ) : null}
          </>
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
          {m.readings.length > 0 ? (
            <PressureChart
              readings={[...m.readings].reverse()}
              cleanKpa={m.pressure?.clean?.kpa ?? null}
              thresholdKpa={m.pressure?.clean ? m.pressure.clean.kpa + PRESSURE_RISE_KPA : null}
              units={units}
            />
          ) : null}
          <PressureForm poolId={pool.id} units={units} />
          {m.readings.length > 0 ? (
            <LogList
              poolId={pool.id}
              kind="pressure"
              units={units}
              today={m.today}
              items={m.readings.slice(0, 8).map((r) => ({
                id: r.id,
                date: r.readOn,
                text: `${day(r.readOn)}: ${formatPressure(r.kpa, units)}${r.clean ? " (clean)" : ""}`,
                pressure: {
                  value: String(units === "us" ? Math.round(kpaToDisplayPressure(r.kpa, units)) : Math.round(kpaToDisplayPressure(r.kpa, units) * 10) / 10),
                  clean: r.clean,
                },
              }))}
            />
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
                <p>
                  <Link href={`${settingsHref}#equip-cell`} className={link}>
                    Add the day the cell was installed
                  </Link>{" "}
                  to see how much of its life it has used.
                </p>
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
                  {ratedHours ? <HoursBar used={m.cell.hours.hours} rated={ratedHours} /> : null}
                  {(() => {
                    const month = cellReplacementMonth({
                      hoursUsed: m.cell.hours.hours,
                      ratedHours,
                      hoursPerDay: m.cell.hoursPerDay,
                      today: m.today,
                    });
                    return month ? (
                      <p>
                        At today&apos;s pump schedule and setting (about {Math.round((m.cell.hoursPerDay ?? 0) * 10) / 10} h a
                        day), the rated hours run out around <strong>{month}</strong>.
                      </p>
                    ) : null;
                  })()}
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
                  <Link href={`/app/pools/${pool.id}/pump?${fromParam(`/app/pools/${pool.id}/maintenance`)}`} className={link}>
                    Add the pump schedule
                  </Link>{" "}
                  to count its hours.
                </p>
              )}
              {m.cell.installedOn && !ratedHours ? (
                <LifeBar span={lifeSpan(m.cell.installedOn, m.today, TYPICAL_LIFE_YEARS.cell)} label="Salt cell" />
              ) : null}
              {m.cell.installedOn && !ratedHours ? (
                <p>
                  Typical life {TYPICAL_LIFE_YEARS.cell[0]} to {TYPICAL_LIFE_YEARS.cell[1]} years; this one is{" "}
                  {formatAge(ageYears(m.cell.installedOn, m.today))} old,{" "}
                  {LIFE_TEXT[lifeState(ageYears(m.cell.installedOn, m.today), TYPICAL_LIFE_YEARS.cell)]}.
                </p>
              ) : null}
              {m.cell.installedOn ? (
                <p className="text-xs text-muted">
                  Wrong date?{" "}
                  <Link href={`${settingsHref}#equip-cell`} className={link}>
                    Edit the cell in Settings
                  </Link>
                  .
                </p>
              ) : null}
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
                {life ? <LifeBar span={lifeSpan(e.installedOn, m.today, life)} label={KIND_LABELS[e.kind]} /> : null}
                <p>
                  Installed {day(e.installedOn)} ({formatAge(years)})
                  {life ? (
                    <>
                      . Typical life {life[0]} to {life[1]} years: <strong>{lifeSpan(e.installedOn, m.today, life).left}</strong>.
                    </>
                  ) : (
                    "."
                  )}
                </p>
                {e.kind === "pump" ? (
                  m.pumpHours ? (
                    <p>
                      About <strong>{m.pumpHours.hours.toLocaleString("en-US")} hours</strong> of running since{" "}
                      {day(e.installedOn)}, counted from your pump schedules
                      {m.pumpHours.extrapolated ? " (before the first one, Tuffo assumes it)" : ""}.
                    </p>
                  ) : (
                    <p>
                      <Link href={`/app/pools/${pool.id}/pump?${fromParam(`/app/pools/${pool.id}/maintenance`)}`} className={link}>
                        Add the pump schedule
                      </Link>{" "}
                      to count its running hours.
                    </p>
                  )
                ) : null}
                <p className="text-xs text-muted">
                  Wrong date?{" "}
                  <Link href={`${settingsHref}#equip-${e.kind}`} className={link}>
                    Edit the {KIND_LABELS[e.kind].toLowerCase()} in Settings
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
          <LogList
            poolId={pool.id}
            kind="maintenance"
            units={units}
            today={m.today}
            items={m.history.slice(0, 20).map((h) => ({
              id: h.id,
              date: h.doneOn,
              text: `${day(h.doneOn)}: ${taskById(h.task)?.label ?? h.task}`,
            }))}
          />
        </section>
      ) : null}
    </>
  );
}

function HowTo({ text }: { text: string }) {
  return (
    <details className="text-xs">
      <summary className="cursor-pointer font-semibold text-lagoon">How to</summary>
      <p className="mt-1 text-muted">{text}</p>
    </details>
  );
}

function TaskCard({ s, poolId, today }: { s: TaskStatus; poolId: string; today: string }) {
  const due = dueParts(s, today);
  const progress = intervalProgress(s);
  const tone = statusTone(s);
  return (
    <li className={`flex flex-col gap-2 rounded-2xl border p-4 ${STATE_STYLE[s.state]}`}>
      <div className="flex items-start gap-3">
        <h4 className="min-w-0 flex-1 font-semibold">{s.task.label}</h4>
        <div className="shrink-0 text-right">
          <p className={`text-sm font-semibold ${s.state === "overdue" ? "text-red-700 dark:text-red-300" : ""}`}>{due.relative}</p>
          {due.date ? <p className="text-xs text-muted">{due.date}</p> : null}
        </div>
      </div>
      <div className="flex items-center gap-3">
        {progress ? (
          <div className="flex-1">
            <IntervalBar
              share={progress.share}
              tone={progress.tone}
              text={`${Math.round(Math.min(progress.share, 1) * 100)}% of the interval gone; due ${due.relative}`}
            />
          </div>
        ) : (
          <div className="flex-1" />
        )}
        {tone ? <TonePill tone={tone} /> : null}
      </div>
      <p className="text-xs text-muted">
        {s.lastDone ? `Last done ${day(s.lastDone)} · ` : ""}
        {describeInterval(s.intervalDays)}
        {s.intervalDays !== s.task.defaultDays ? " (your setting)" : ""}
      </p>
      <HowTo text={s.task.how} />
      <DoneForm poolId={poolId} task={s.task.id} taskLabel={s.task.label} withDate />
      <IntervalForm poolId={poolId} task={s.task.id} days={s.intervalDays} defaultDays={s.task.defaultDays} />
    </li>
  );
}
