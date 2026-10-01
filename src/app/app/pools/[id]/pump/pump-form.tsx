"use client";

import { useActionState, useState } from "react";
import { savePumpSchedule, type PumpState } from "../actions";
import { ScanButton, type ScanAllowance, type ScanResponse } from "@/components/scan-button";
import { cellHoursPerDay, LOW_GPM, LOW_RPM, MAX_RUNS, type PumpSegment, type SpeedUnit } from "@/lib/pump";

const initial: PumpState = {};
const field = "h-10 rounded-xl border border-border bg-surface px-2 text-sm";

interface Row {
  key: number;
  start: string;
  end: string;
  speed: string;
  cell: boolean;
}

let nextKey = 1;
const row = (r: Partial<Row> = {}): Row => ({ key: nextKey++, start: "", end: "", speed: "", cell: true, ...r });

/**
 * The runs in a day, typed or read from a screenshot of the pump's app or panel. Each run
 * says whether the salt cell makes chlorine during it (many cells stay off at low speed).
 */
export function PumpForm({
  poolId,
  timeZone,
  current,
  scanEnabled,
  allowance,
  defaultUnit = "rpm",
}: {
  poolId: string;
  timeZone: string;
  current: PumpSegment[] | null;
  scanEnabled: boolean;
  allowance: ScanAllowance | null;
  /** From the pump in the pool's settings: GPM for pumps usually set by flow. */
  defaultUnit?: SpeedUnit;
}) {
  const [state, action, pending] = useActionState(savePumpSchedule, initial);
  const [rows, setRows] = useState<Row[]>(() =>
    current && current.length
      ? current.map((s) => row({ start: s.start, end: s.end, speed: s.speed ? String(s.speed) : "", cell: s.cell }))
      : [row({ start: "08:00", end: "16:00" })],
  );
  const [source, setSource] = useState<"manual" | "screenshot">("manual");
  const [unit, setUnit] = useState<SpeedUnit>(current?.find((s) => s.unit)?.unit ?? defaultUnit);
  const [scanNote, setScanNote] = useState<string | null>(null);

  const hours = cellHoursPerDay(rows.filter((r) => r.start && r.end).map((r) => ({ start: r.start, end: r.end, cell: r.cell })));
  const set = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  function applyScan(result: ScanResponse) {
    const read = result.rows ?? [];
    if (read.length === 0) {
      setScanNote(result.notes ?? "No runs could be read. Type them below.");
      return;
    }
    const scanned = read.map((r) => row({ start: r.start, end: r.end, speed: r.speed ? String(r.speed) : "", cell: r.cell }));
    // A second screenshot (a list that went past the screen) adds its runs to the first.
    setRows((rs) => {
      if (source !== "screenshot") return scanned;
      const seen = new Set(rs.map((r) => `${r.start}-${r.end}`));
      return [...rs, ...scanned.filter((r) => !seen.has(`${r.start}-${r.end}`))].slice(0, MAX_RUNS);
    });
    if (result.unit) setUnit(result.unit);
    setSource("screenshot");
    setScanNote(
      `${result.confidence === "low" ? "Read with low confidence: check every time." : "Read from your screenshot: check the times."}${
        result.notes ? ` ${result.notes}` : ""
      } Runs under ${(result.unit ?? unit) === "gpm" ? `${LOW_GPM} GPM` : `${LOW_RPM.toLocaleString("en-US")} RPM`} are marked without the cell; check your cell's minimum flow and change that if it runs lower.`,
    );
  }

  if (state.saved) {
    return (
      <p role="status" className="rounded-2xl border border-border bg-surface p-4">
        Saved. Tuffo now counts what the cell makes with this schedule; the plan updates in a few seconds.
      </p>
    );
  }

  return (
    <form action={action} className="flex max-w-2xl flex-col gap-5">
      <input type="hidden" name="pool_id" value={poolId} />
      <input type="hidden" name="time_zone" value={timeZone} />
      <input type="hidden" name="source" value={source} />

      {scanEnabled ? (
        <div className="flex flex-col gap-2 rounded-2xl border border-dashed border-border p-4">
          <ScanButton onResult={applyScan} disabled={pending} allowance={allowance} endpoint="/api/scan/pump" label="Read a screenshot of the schedule" camera={false} />
          <p className="text-xs text-muted">
            A screenshot of the pump&apos;s app or a photo of its panel or timer. It is read once and not kept, and counts
            as one scan.
          </p>
          {scanNote ? (
            <p role="status" className="rounded-xl bg-ice/20 px-3 py-2 text-sm">
              {scanNote}
            </p>
          ) : null}
        </div>
      ) : null}

      <input type="hidden" name="speed_unit" value={unit} />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold">Runs in a day</legend>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted">The pump is set by</span>
          {(["rpm", "gpm"] as const).map((u) => (
            <label key={u} className="flex items-center gap-1.5">
              <input type="radio" name="unit_choice" checked={unit === u} onChange={() => setUnit(u)} className="accent-lagoon" />
              {u === "rpm" ? "speed (RPM)" : "flow (GPM)"}
            </label>
          ))}
        </div>
        {rows.map((r, i) => (
          <div key={r.key} className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-muted">
              From
              <input type="time" name={`start_${i}`} value={r.start} onChange={(e) => set(r.key, { start: e.target.value })} className={field} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              To
              <input type="time" name={`end_${i}`} value={r.end} onChange={(e) => set(r.key, { end: e.target.value })} className={field} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              {unit === "rpm" ? "Speed (RPM, optional)" : "Flow (GPM, optional)"}
              <input
                name={`speed_${i}`}
                inputMode="decimal"
                value={r.speed}
                onChange={(e) => set(r.key, { speed: e.target.value.replace(unit === "rpm" ? /[^0-9]/g : /[^0-9.]/g, "") })}
                placeholder={unit === "rpm" ? "2400" : "35"}
                className={`${field} w-24`}
              />
            </label>
            <label className="flex h-10 items-center gap-2 text-sm">
              <input type="checkbox" name={`cell_${i}`} checked={r.cell} onChange={(e) => set(r.key, { cell: e.target.checked })} className="accent-lagoon" />
              Salt cell on
            </label>
            {rows.length > 1 ? (
              <button type="button" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} className="h-10 px-2 text-sm text-muted hover:text-foreground">
                Remove
              </button>
            ) : null}
          </div>
        ))}
        {rows.length < MAX_RUNS ? (
          <button type="button" onClick={() => setRows((rs) => [...rs, row()])} className="self-start text-sm font-semibold text-lagoon">
            + Add a run
          </button>
        ) : null}
        <p className="text-sm">
          The salt cell runs <strong>{hours === null ? "—" : `${hours} h`}</strong> a day.
        </p>
      </fieldset>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-semibold">
          Running this schedule since <span className="font-normal text-muted">(empty = from now)</span>
        </span>
        <input type="date" name="since" className={`${field} w-44`} />
      </label>

      {state.error ? (
        <p role="alert" className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="h-12 self-start rounded-xl bg-lagoon px-6 text-base font-semibold text-white hover:bg-lagoon-deep disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save schedule"}
      </button>
    </form>
  );
}
