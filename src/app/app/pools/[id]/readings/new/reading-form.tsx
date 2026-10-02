"use client";

import { RemoveEntry } from "@/components/remove-entry";
import { WhenField } from "@/components/when-field";
import { CancelLink, ReturnTo } from "@/components/form-cancel";

import { useActionState, useState } from "react";
import { QueuedNotice, useOfflineLog } from "@/components/offline-log";
import { ScanButton, type ScanAllowance, type ScanResponse } from "@/components/scan-button";
import { READING_METHODS, type Units } from "@/lib/format";
import { rangeHint, type HintField } from "@/lib/reading-hints";
import { scanTakenAt } from "@/lib/scan/map";
import { EditFields, type EditTarget } from "@/components/edit-fields";
import { saveReading, type LogState as ReadingState } from "../../actions";

const initial: ReadingState = {};

const input =
  "h-11 w-full rounded-xl border border-border-input bg-surface px-3 text-base text-foreground outline-none placeholder:text-muted/70 focus:border-lagoon focus:ring-2 focus:ring-lagoon/30";
const flagged = "border-chip-warn-fg ring-2 ring-chip-warn-fg/30";

interface Field {
  name: HintField;
  label: string;
  unit: string;
  step: string;
}

const FC: Field = { name: "fc", label: "Free chlorine", unit: "ppm", step: "any" };
const CC: Field = { name: "cc", label: "Combined chlorine", unit: "ppm", step: "any" };
const PH: Field = { name: "ph", label: "pH", unit: "", step: "any" };
const TA: Field = { name: "ta", label: "Alkalinity (TA)", unit: "ppm", step: "any" };
const CYA: Field = { name: "cya", label: "Stabilizer (CYA)", unit: "ppm", step: "any" };
const SALT: Field = { name: "salt", label: "Salt", unit: "ppm", step: "any" };
const CH: Field = { name: "ch", label: "Calcium (CH)", unit: "ppm", step: "any" };
const BORATE: Field = { name: "borate", label: "Borates", unit: "ppm", step: "any" };
const PHOSPHATE: Field = { name: "phosphate", label: "Phosphates", unit: "ppb", step: "any" };

type Values = Record<string, string>;

export function ReadingForm({
  poolId,
  units,
  swg,
  scanEnabled,
  scanAllowance,
  edit,
  returnTo,
  last = {},
  lastMethod = null,
}: {
  /** Where Save and Cancel go back to. */
  returnTo: string;
  poolId: string;
  units: Units;
  swg: boolean;
  scanEnabled: boolean;
  scanAllowance: ScanAllowance | null;
  /** Set when changing a saved test instead of logging a new one. */
  edit?: EditTarget;
  /** Each measure's last value, "8.0 on Sep 26", shown under its field. */
  last?: Partial<Record<HintField, string>>;
  /** The method of the last test, the default for "Tested with". */
  lastMethod?: string | null;
}) {
  const offline = useOfflineLog("reading", Boolean(edit), saveReading);
  const [state, action, pending] = useActionState(offline.submit, initial);
  const f = state.fields ?? edit?.values ?? {};
  const [values, setValues] = useState<Values>(() => ({
    ...f,
    method: f.method ?? (lastMethod && READING_METHODS.some((m) => m.value === lastMethod) ? lastMethod : "drop_kit"),
  }));
  const main = swg ? [FC, CC, PH, TA, CYA, SALT] : [FC, CC, PH, TA, CYA];
  const more = swg ? [CH, BORATE, PHOSPHATE] : [CH, SALT, BORATE, PHOSPHATE];
  const [showMore, setShowMore] = useState(more.some((m) => Boolean(f[m.name])));
  const [scan, setScan] = useState<ScanResponse | null>(null);

  const set = (name: string, value: string) => setValues((v) => ({ ...v, [name]: value }));
  // Range hints show once a field is left (or the form sent, or a value arrived filled in),
  // not while typing: "7" on the way to "7.4" is not a typo.
  const [checked, setChecked] = useState<Set<string>>(() => new Set(Object.keys(f).filter((k) => f[k])));
  const check = (name: string) => setChecked((c) => (c.has(name) ? c : new Set(c).add(name)));
  const uncertain = new Set(scan?.uncertain ?? []);

  function applyScan(result: ScanResponse) {
    const next: Values = { ...values };
    for (const [name, value] of Object.entries(result.fields ?? {})) next[name] = String(value);
    if (typeof result.waterTempC === "number") {
      next.water_temp = String(units === "us" ? Math.round((result.waterTempC * 9) / 5 + 32) : Math.round(result.waterTempC));
    }
    if (result.method) next.method = result.method;
    const now = new Date();
    const localToday = new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
    const scanned = scanTakenAt(result.testDate, localToday);
    if (scanned && !next.taken_at) next.taken_at = scanned;
    if (more.some((m) => result.fields?.[m.name] !== undefined)) setShowMore(true);
    setValues(next);
    setScan(result);
    setChecked((c) => new Set([...c, ...Object.keys(result.fields ?? {})]));
  }

  const renderField = (field: Field) => {
    const hint = checked.has(field.name) ? rangeHint(field.name, values[field.name] ?? "", units) : null;
    const previous = edit ? undefined : last[field.name];
    return (
      <div key={field.name} className="flex min-w-0 flex-col gap-1">
        <label htmlFor={field.name} className="text-sm font-semibold">
          {field.label}
        </label>
        <div className="relative">
          <input
            id={field.name}
            name={field.name}
            inputMode="decimal"
            type="number"
            step={field.step}
            min={0}
            value={values[field.name] ?? ""}
            onChange={(e) => set(field.name, e.target.value)}
            onBlur={() => check(field.name)}
            aria-describedby={`${field.name}-help`}
            className={`${input} ${field.unit ? "pr-12" : ""} ${uncertain.has(field.name) || hint ? flagged : ""}`}
          />
          {field.unit ? (
            <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted">
              {field.unit}
            </span>
          ) : null}
        </div>
        <p id={`${field.name}-help`} className="text-xs text-muted">
          {hint ? <span className="block font-semibold text-foreground">{hint}</span> : null}
          {field.unit ? <span className="sr-only">In {field.unit}. </span> : null}
          {previous ? `last: ${previous}` : null}
        </p>
      </div>
    );
  };

  if (offline.queued) return <QueuedNotice poolId={poolId} what="test" />;

  return (
    <form
      action={action}
      onSubmit={(e) => {
        setChecked(new Set(Object.keys(values)));
        offline.onSubmit(e);
      }}
      className="flex max-w-2xl flex-col gap-6"
    >
      <input type="hidden" name="pool_id" value={poolId} />
      <input type="hidden" name="units" value={units} />
      {offline.hidden}
      <ReturnTo value={returnTo} />
      <EditFields edit={edit} whenField="taken_at" />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor="method" className="text-sm font-semibold">
            Tested with
          </label>
          <select
            id="method"
            name="method"
            value={values.method ?? "drop_kit"}
            onChange={(e) => set("method", e.target.value)}
            className={input}
          >
            {READING_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
            {values.method === "imported" ? <option value="imported">Imported</option> : null}
          </select>
        </div>
        <WhenField id="taken_at" name="taken_at" edit={Boolean(edit)} value={values.taken_at ?? ""} onChange={(v) => set("taken_at", v)} />
      </div>

      {scanEnabled && !edit ? (
        <div id="scan" className="flex scroll-mt-4 flex-col gap-2 target:rounded-xl target:ring-2 target:ring-lagoon/30">
          <div className="flex flex-wrap items-center gap-2">
            <ScanButton onResult={applyScan} disabled={pending} allowance={scanAllowance} />
            <details className="group text-xs text-muted">
              <summary
                aria-label="About scanning"
                className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-full text-base text-lagoon hover:bg-lagoon/10"
              >
                ⓘ
              </summary>
              <p className="mt-1 max-w-sm">
                Photograph the pool store&apos;s printout, a test strip beside its chart, or a tester screen. The
                numbers land in the form for you to check; the photo is read once and not kept.
              </p>
            </details>
          </div>
          {scan ? (
            <p
              role="status"
              className={`rounded-xl px-3 py-2 text-sm ${
                scan.confidence === "low" ? "bg-chip-warn-bg text-chip-warn-fg" : "bg-ice/20 text-foreground"
              }`}
            >
              {scan.confidence === "low"
                ? "Read with low confidence: check every number before saving."
                : "Read from your photo: check the numbers before saving."}
              {uncertain.size > 0 ? " Highlighted fields were hard to read." : ""}
              {scan.notes ? ` ${scan.notes}` : ""}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-x-3 gap-y-4 lg:grid-cols-3">
        {main.map(renderField)}
        {renderField({ name: "water_temp", label: "Water temp", unit: units === "us" ? "°F" : "°C", step: "any" })}
      </div>

      <details open={showMore} onToggle={(e) => setShowMore(e.currentTarget.open)} className="group">
        <summary className="cursor-pointer list-none text-sm font-semibold text-lagoon">
          <span aria-hidden="true" className="inline-block transition group-open:rotate-90">
            ›
          </span>{" "}
          More tests <span className="font-normal text-muted">({more.map((m) => m.label.replace(/ \(.*\)/, "")).join(", ").toLowerCase()})</span>
        </summary>
        <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-4 lg:grid-cols-3">{more.map(renderField)}</div>
      </details>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="notes" className="text-sm font-semibold">
          Notes <span className="font-normal text-muted">(optional)</span>
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={2}
          maxLength={2000}
          value={values.notes ?? ""}
          onChange={(e) => set("notes", e.target.value)}
          className="rounded-xl border border-border-input bg-surface px-3 py-2 text-base outline-none focus:border-lagoon focus:ring-2 focus:ring-lagoon/30"
        />
      </div>

      {state.error ? (
        <p role="alert" className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          {state.error}
        </p>
      ) : null}

      <div className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 -mx-4 flex flex-wrap items-center gap-3 border-t border-border bg-background/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
        <button
          type="submit"
          disabled={pending}
          className="h-12 self-start rounded-xl bg-action px-6 text-base font-semibold text-white transition hover:bg-action-deep disabled:opacity-60"
        >
          {pending ? "Saving…" : edit ? "Save changes" : "Save test"}
        </button>
        <CancelLink href={returnTo} />
      </div>
      {edit ? <RemoveEntry kind="reading" id={edit.id} returnTo={returnTo} /> : null}
    </form>
  );
}
