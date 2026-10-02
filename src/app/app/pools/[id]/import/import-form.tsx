"use client";

import Link from "next/link";
import { CancelLink } from "@/components/form-cancel";
import { useMemo, useState } from "react";
import type { ImportSummary } from "@/app/api/pools/[id]/import/route";
import { parseCsv, type CsvTable, type Delimiter } from "@/lib/import/csv";
import { guessDateOrder, type DateOrder } from "@/lib/import/dates";
import {
  guessDecimalMark,
  guessMapping,
  guessTempUnit,
  IMPORT_FIELDS,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ROWS,
  planImport,
  type DecimalMark,
  type ImportField,
  type Mapping,
} from "@/lib/import/readings";
import type { Units } from "@/lib/format";

const select = "h-10 w-full rounded-xl border border-border bg-surface px-2 text-sm";

interface Choices {
  csv: string;
  delimiter: Delimiter;
  decimal: DecimalMark;
  mapping: Mapping;
  dateOrder: DateOrder;
  tempUnit: "F" | "C";
  importNearDuplicates: boolean;
  logUpkeep: boolean;
}

interface Loaded {
  name: string;
  csv: string;
  table: CsvTable;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}

/** "2 backwashes, 1 filter cleaning (Hose off the filter cartridge), 3 vacuumings" and what happens to them. */
function upkeepLines(u: ImportSummary["upkeep"]): string[] {
  const marked = [
    u.backwash ? plural(u.backwash, "backwash", "backwashes") : null,
    u.filterClean ? plural(u.filterClean, "filter cleaning") : null,
    u.vacuum ? plural(u.vacuum, "vacuuming") : null,
  ].filter(Boolean);
  const lines = [`The file marks ${marked.join(", ")} (days).`];
  if (u.toLog) {
    const as = [u.backwash ? `backwashes as events${u.backwashTask ? ` and "${u.backwashTask}" done` : ""}` : null, u.filterClean && u.filterTask ? `filter cleanings as "${u.filterTask}" done` : null]
      .filter(Boolean)
      .join(", ");
    lines.push(`${plural(u.toLog, "entry", "entries")} to log (${as}).`);
  }
  if (u.alreadyLogged) lines.push(`${u.alreadyLogged} already logged that day, skipped.`);
  if (u.notTracked) {
    const why = [
      u.filterClean && !u.filterTask ? "filter cleaning needs a cartridge or DE filter in the pool's equipment" : null,
      u.vacuum ? "Tuffo has no vacuuming task" : null,
    ].filter(Boolean);
    lines.push(`${u.notTracked} skipped: ${why.join("; ")}.`);
  }
  return lines;
}

function describe(summary: ImportSummary): string[] {
  const lines: string[] = [];
  if (summary.alreadyLogged) lines.push(`${summary.alreadyLogged} already logged (same minute), skipped.`);
  if (summary.duplicatesInFile) lines.push(`${summary.duplicatesInFile} repeated in the file (same minute), skipped.`);
  if (summary.problemCount) lines.push(`${summary.problemCount} rows could not be read and will be left out.`);
  if (summary.overLimit) lines.push(`${summary.overLimit} rows past the first ${MAX_IMPORT_ROWS.toLocaleString("en-US")} were not read.`);
  return lines;
}

export function ImportForm({ poolId, units, timeZone }: { poolId: string; units: Units; timeZone: string }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [delimiter, setDelimiter] = useState<Delimiter>(",");
  const [decimal, setDecimal] = useState<DecimalMark>(".");
  const [dateOrder, setDateOrder] = useState<DateOrder>("mdy");
  const [tempUnit, setTempUnit] = useState<"F" | "C">(units === "us" ? "F" : "C");
  const [importNearDuplicates, setImportNearDuplicates] = useState(false);
  const [logUpkeep, setLogUpkeep] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<ImportSummary | null>(null);

  const preview = useMemo(
    () => (loaded ? planImport(loaded.table, { mapping, dateOrder, tempUnit, decimal, timeZone }).rows.slice(0, 8) : []),
    [loaded, mapping, dateOrder, tempUnit, decimal, timeZone],
  );

  async function send(next: Choices, dryRun: boolean) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/pools/${poolId}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...next, dryRun }),
      });
      const body = (await response.json()) as ImportSummary | { ok: false; error: string };
      if (!body.ok) {
        setError(body.error);
        return;
      }
      setSummary(body);
      if (!dryRun) setDone(body);
    } catch {
      setError("Could not reach Tuffo. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function onFile(file: File | undefined) {
    setSummary(null);
    setDone(null);
    setError(null);
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      setError("Files up to 1 MB, please. Split a larger export into years.");
      return;
    }
    await load(file.name, await file.text());
  }

  /** Reads the file with a separator (its own guess unless chosen) and guesses the rest again. */
  async function load(name: string, csv: string, separator?: Delimiter) {
    const table = parseCsv(csv, separator);
    if (table.headers.length === 0 || table.rows.length === 0) {
      setError("That file has no rows. Choose a CSV with a header line and one test per line.");
      return;
    }
    const sep = table.delimiter ?? ",";
    const guessed = guessMapping(table.headers);
    const order = guessed.when === undefined ? "mdy" : guessDateOrder(table.rows.map((r) => r[guessed.when!] ?? ""));
    const unit = guessTempUnit(guessed.water_temp === undefined ? undefined : table.headers[guessed.water_temp]) ?? tempUnit;
    const numberColumns = Object.entries(guessed)
      .filter(([key]) => key !== "when" && key !== "notes")
      .map(([, i]) => i as number);
    const mark = guessDecimalMark(table.rows.slice(0, 200).flatMap((r) => numberColumns.map((i) => r[i] ?? "")), sep);
    setLoaded({ name, csv, table });
    setDelimiter(sep);
    setDecimal(mark);
    setMapping(guessed);
    setDateOrder(order);
    setTempUnit(unit);
    setImportNearDuplicates(false);
    setLogUpkeep(false);
    await send(
      { csv, delimiter: sep, decimal: mark, mapping: guessed, dateOrder: order, tempUnit: unit, importNearDuplicates: false, logUpkeep: false },
      true,
    );
  }

  const choices = (): Omit<Choices, "csv"> => ({ delimiter, decimal, mapping, dateOrder, tempUnit, importNearDuplicates, logUpkeep });

  function change(next: Partial<Omit<Choices, "csv">>) {
    if (!loaded) return;
    const merged = { ...choices(), ...next };
    if (next.mapping) setMapping(next.mapping);
    if (next.decimal) setDecimal(next.decimal);
    if (next.dateOrder) setDateOrder(next.dateOrder);
    if (next.tempUnit) setTempUnit(next.tempUnit);
    if (next.importNearDuplicates !== undefined) setImportNearDuplicates(next.importNearDuplicates);
    if (next.logUpkeep !== undefined) setLogUpkeep(next.logUpkeep);
    void send({ csv: loaded.csv, ...merged }, true);
  }

  if (done !== null) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-2xl border border-border bg-surface p-5">
        <p role="status" className="text-lg font-semibold">
          Imported {plural(done.imported, "test")}
          {done.upkeepLogged ? ` and ${plural(done.upkeepLogged, "upkeep entry", "upkeep entries")}` : ""}.
        </p>
        {done.imported ? (
          <p className="text-sm text-muted">They show in the history and the charts, marked as imported. Tuffo is relearning this pool&apos;s chlorine use from them.</p>
        ) : null}
        {done.upkeepError ? (
          <p role="alert" className="text-sm text-red-800">
            {done.upkeepError}
          </p>
        ) : null}
        <Link href={`/app/pools/${poolId}`} className="rounded-xl bg-lagoon px-4 py-2.5 text-sm font-semibold text-white hover:bg-lagoon-deep">
          Back to the pool
        </Link>
      </div>
    );
  }

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString("en-US", { timeZone, month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  const cell = (v: number | undefined) => (v === undefined ? "—" : String(v));
  const upkeepToLog = summary && logUpkeep ? summary.upkeep.toLog : 0;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <label htmlFor="csv" className="text-sm font-semibold">
          CSV file <span className="font-normal text-muted">(up to 1 MB, {MAX_IMPORT_ROWS.toLocaleString("en-US")} tests)</span>
        </label>
        <input
          id="csv"
          type="file"
          accept=".csv,text/csv,text/plain"
          onChange={(e) => void onFile(e.target.files?.[0])}
          className="text-sm file:mr-3 file:rounded-xl file:border file:border-border file:bg-surface file:px-4 file:py-2 file:font-semibold"
        />
      </div>

      {loaded ? (
        <>
          <fieldset className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
            <legend className="px-1 text-sm font-semibold">Which column is which</legend>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="flex flex-col gap-1 text-xs text-muted">
                Columns are separated by
                <select
                  value={delimiter}
                  onChange={(e) => {
                    setSummary(null);
                    void load(loaded.name, loaded.csv, e.target.value as Delimiter);
                  }}
                  className={select}
                >
                  <option value=",">Commas (,)</option>
                  <option value=";">Semicolons (;)</option>
                  <option value={"\t"}>Tabs</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted">
                Numbers are written
                <select value={decimal} onChange={(e) => change({ decimal: e.target.value as DecimalMark })} className={select}>
                  <option value=".">3.5 and 3,200</option>
                  <option value=",">3,5 and 3.200</option>
                </select>
              </label>
              {IMPORT_FIELDS.map((field) => (
                <label key={field.key} className="flex flex-col gap-1 text-xs text-muted">
                  {field.label}
                  <select
                    value={mapping[field.key as ImportField] ?? ""}
                    onChange={(e) => {
                      const next = { ...mapping };
                      if (e.target.value === "") delete next[field.key as ImportField];
                      else next[field.key as ImportField] = Number(e.target.value);
                      change({ mapping: next });
                    }}
                    className={select}
                  >
                    <option value="">{"required" in field ? "Choose…" : "Not in the file"}</option>
                    {loaded.table.headers.map((h, i) => (
                      <option key={i} value={i}>
                        {h || `Column ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              <label className="flex flex-col gap-1 text-xs text-muted">
                Dates are written
                <select value={dateOrder} onChange={(e) => change({ dateOrder: e.target.value as DateOrder })} className={select}>
                  <option value="mdy">Month first (9/27/2026)</option>
                  <option value="dmy">Day first (27/9/2026)</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted">
                Temperatures are in
                <select value={tempUnit} onChange={(e) => change({ tempUnit: e.target.value as "F" | "C" })} className={select}>
                  <option value="F">°F</option>
                  <option value="C">°C</option>
                </select>
              </label>
            </div>
            <p className="text-xs text-muted">Times without a zone are read as the time at the pool ({timeZone}).</p>
          </fieldset>

          {preview.length > 0 ? (
            <div className="overflow-x-auto rounded-2xl border border-border">
              <table className="w-full min-w-[560px] text-sm">
                <caption className="px-4 py-2 text-left text-xs text-muted">First rows as Tuffo reads them</caption>
                <thead className="bg-surface text-left text-xs font-semibold text-muted">
                  <tr>
                    <th className="px-4 py-2">When</th>
                    <th className="px-3 py-2 text-right">FC</th>
                    <th className="px-3 py-2 text-right">pH</th>
                    <th className="px-3 py-2 text-right">TA</th>
                    <th className="px-3 py-2 text-right">CH</th>
                    <th className="px-3 py-2 text-right">CYA</th>
                    <th className="px-3 py-2 text-right">Salt</th>
                    <th className="px-3 py-2 text-right">Temp (°C)</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r) => (
                    <tr key={r.line} className="border-t border-border">
                      <td className="px-4 py-2 whitespace-nowrap">{fmt(r.taken_at)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{cell(r.values.fc)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{cell(r.values.ph)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{cell(r.values.ta)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{cell(r.values.ch)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{cell(r.values.cya)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{cell(r.values.salt)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.water_temp_c ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {summary ? (
            <div role="status" className="flex flex-col gap-2 text-sm">
              <p className="font-semibold">
                {summary.ready.toLocaleString("en-US")} {summary.ready === 1 ? "test" : "tests"} ready to import from {loaded.name}.
              </p>
              {describe(summary).map((line) => (
                <p key={line} className="text-muted">
                  {line}
                </p>
              ))}
              {summary.nearDuplicates > 0 ? (
                <div className="flex flex-col gap-1 rounded-xl border border-border bg-surface p-3">
                  <p>
                    {plural(summary.nearDuplicates, "row")} {summary.nearDuplicates === 1 ? "matches a test" : "match tests"} already logged on
                    the same day with the same results, at another time. {summary.nearDuplicatesIncluded ? "They will be imported too." : "Skipped."}
                  </p>
                  <ul className="list-disc pl-5 text-muted">
                    {summary.nearDuplicateLines.map((d) => (
                      <li key={d.line}>
                        Line {d.line}: same as the test logged {fmt(d.loggedAt)}
                      </li>
                    ))}
                  </ul>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={importNearDuplicates}
                      disabled={busy}
                      onChange={(e) => change({ importNearDuplicates: e.target.checked })}
                      className="size-4"
                    />
                    Import them anyway
                  </label>
                </div>
              ) : null}
              {summary.upkeep.backwash + summary.upkeep.filterClean + summary.upkeep.vacuum > 0 ? (
                <div className="flex flex-col gap-1 rounded-xl border border-border bg-surface p-3">
                  {upkeepLines(summary.upkeep).map((line) => (
                    <p key={line} className="text-muted">
                      {line}
                    </p>
                  ))}
                  {summary.upkeep.toLog > 0 ? (
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={logUpkeep}
                        disabled={busy}
                        onChange={(e) => change({ logUpkeep: e.target.checked })}
                        className="size-4"
                      />
                      Also log {plural(summary.upkeep.toLog, "upkeep entry", "upkeep entries")}
                    </label>
                  ) : null}
                </div>
              ) : null}
              {summary.problems.length > 0 ? (
                <details className="text-muted">
                  <summary className="cursor-pointer">Rows left out</summary>
                  <ul className="mt-1 list-disc pl-5">
                    {summary.problems.map((p) => (
                      <li key={p.line}>
                        Line {p.line}: {p.reason}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={busy || !summary || (summary.ready === 0 && upkeepToLog === 0)}
              onClick={() => void send({ csv: loaded.csv, ...choices() }, false)}
              className="h-12 self-start rounded-xl bg-lagoon px-6 text-base font-semibold text-white hover:bg-lagoon-deep disabled:opacity-60"
            >
              {busy
                ? "Working…"
                : summary && summary.ready > 0
                  ? `Import ${plural(summary.ready, "test")}${upkeepToLog ? ` and ${plural(upkeepToLog, "upkeep entry", "upkeep entries")}` : ""}`
                  : upkeepToLog
                    ? `Log ${plural(upkeepToLog, "upkeep entry", "upkeep entries")}`
                    : "Nothing to import"}
            </button>
            <CancelLink href={`/app/pools/${poolId}`} />
          </div>
        </>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}
    </div>
  );
}
