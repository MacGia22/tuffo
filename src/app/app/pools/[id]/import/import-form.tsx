"use client";

import Link from "next/link";
import { CancelLink } from "@/components/form-cancel";
import { useMemo, useState } from "react";
import type { ImportSummary } from "@/app/api/pools/[id]/import/route";
import { parseCsv, type CsvTable } from "@/lib/import/csv";
import { guessDateOrder, type DateOrder } from "@/lib/import/dates";
import {
  guessMapping,
  guessTempUnit,
  IMPORT_FIELDS,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ROWS,
  planImport,
  type ImportField,
  type Mapping,
} from "@/lib/import/readings";
import type { Units } from "@/lib/format";

const select = "h-10 w-full rounded-xl border border-border bg-surface px-2 text-sm";

interface Loaded {
  name: string;
  csv: string;
  table: CsvTable;
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
  const [dateOrder, setDateOrder] = useState<DateOrder>("mdy");
  const [tempUnit, setTempUnit] = useState<"F" | "C">(units === "us" ? "F" : "C");
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<number | null>(null);

  const preview = useMemo(
    () => (loaded ? planImport(loaded.table, { mapping, dateOrder, tempUnit, timeZone }).rows.slice(0, 8) : []),
    [loaded, mapping, dateOrder, tempUnit, timeZone],
  );

  async function send(next: { csv: string; mapping: Mapping; dateOrder: DateOrder; tempUnit: "F" | "C" }, dryRun: boolean) {
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
      if (!dryRun) setDone(body.imported);
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
    const csv = await file.text();
    const table = parseCsv(csv);
    if (table.headers.length === 0 || table.rows.length === 0) {
      setError("That file has no rows. Choose a CSV with a header line and one test per line.");
      return;
    }
    const guessed = guessMapping(table.headers);
    const order = guessed.when === undefined ? "mdy" : guessDateOrder(table.rows.map((r) => r[guessed.when!] ?? ""));
    const unit = guessTempUnit(guessed.water_temp === undefined ? undefined : table.headers[guessed.water_temp]) ?? tempUnit;
    setLoaded({ name: file.name, csv, table });
    setMapping(guessed);
    setDateOrder(order);
    setTempUnit(unit);
    await send({ csv, mapping: guessed, dateOrder: order, tempUnit: unit }, true);
  }

  function change(next: Partial<{ mapping: Mapping; dateOrder: DateOrder; tempUnit: "F" | "C" }>) {
    if (!loaded) return;
    const merged = { mapping, dateOrder, tempUnit, ...next };
    if (next.mapping) setMapping(next.mapping);
    if (next.dateOrder) setDateOrder(next.dateOrder);
    if (next.tempUnit) setTempUnit(next.tempUnit);
    void send({ csv: loaded.csv, ...merged }, true);
  }

  if (done !== null) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-2xl border border-border bg-surface p-5">
        <p role="status" className="text-lg font-semibold">
          Imported {done.toLocaleString("en-US")} {done === 1 ? "test" : "tests"}.
        </p>
        <p className="text-sm text-muted">They show in the history and the charts, marked as imported. Tuffo is relearning this pool&apos;s chlorine use from them.</p>
        <Link href={`/app/pools/${poolId}`} className="rounded-xl bg-lagoon px-4 py-2.5 text-sm font-semibold text-white hover:bg-lagoon-deep">
          Back to the pool
        </Link>
      </div>
    );
  }

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString("en-US", { timeZone, month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  const cell = (v: number | undefined) => (v === undefined ? "—" : String(v));

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
              disabled={busy || !summary || summary.ready === 0}
              onClick={() => void send({ csv: loaded.csv, mapping, dateOrder, tempUnit }, false)}
              className="h-12 self-start rounded-xl bg-lagoon px-6 text-base font-semibold text-white hover:bg-lagoon-deep disabled:opacity-60"
            >
              {busy ? "Working…" : summary && summary.ready > 0 ? `Import ${summary.ready.toLocaleString("en-US")} tests` : "Nothing to import"}
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
