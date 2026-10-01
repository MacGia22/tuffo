"use client";

import Link from "next/link";
import { ConfirmButton } from "@/components/confirm-button";
import { ResetButton } from "@/components/form-cancel";
import { IntervalBar, ToneIcon } from "@/components/maintenance-visuals";
import { CellForm } from "@/components/salt-cell-form";
import { useActionState, useState } from "react";
import {
  FEEDER_TYPES,
  FILTER_TYPES,
  HEATER_TYPES,
  KIND_LABELS,
  PUMP_MODELS,
  PUMP_SPEEDS,
  SURFACES,
  type EquipmentKind,
} from "@/lib/equipment";
import type { Units } from "@/lib/format";
import type { Tone } from "@/lib/maintenance";
import {
  deletePool,
  removeEquipment,
  saveEquipment,
  savePoolBasics,
  type DeleteState,
  type SettingsState,
} from "../actions";

const initial: SettingsState = {};
const field = "h-10 rounded-xl border border-border bg-background px-3 text-sm";
const label = "flex flex-col gap-1 text-xs text-muted";
const save =
  "h-10 self-start rounded-xl bg-lagoon px-4 text-sm font-semibold text-white hover:bg-lagoon-deep disabled:opacity-60";

function Status({ state }: { state: SettingsState }) {
  if (state.error) {
    return (
      <p role="alert" className="text-sm text-red-600">
        {state.error}
      </p>
    );
  }
  return state.saved ? (
    <p role="status" className="text-sm text-muted">
      Saved.
    </p>
  ) : null;
}

export function BasicsForm({
  poolId,
  units,
  current,
}: {
  poolId: string;
  units: Units;
  current: { name: string; volume: string; sanitizer: "chlorine" | "swg"; surface: string; covered: boolean };
}) {
  const [state, action, pending] = useActionState(savePoolBasics, initial);
  return (
    <form action={action} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
      <input type="hidden" name="pool_id" value={poolId} />
      <input type="hidden" name="units" value={units} />
      <div className="flex flex-wrap gap-3">
        <label className={label}>
          Name
          <input name="name" required maxLength={80} defaultValue={current.name} className={`${field} w-56`} />
        </label>
        <label className={label}>
          Volume ({units === "us" ? "gallons" : "liters"})
          <input name="volume" required inputMode="decimal" defaultValue={current.volume} className={`${field} w-36`} />
        </label>
        <p className="basis-full text-xs text-muted sm:order-last">
          Not sure? Length × width × average depth: in feet × 7.5 gives gallons; in meters × 1,000 gives liters.
        </p>
        <label className={label}>
          Sanitizer
          <select name="sanitizer" defaultValue={current.sanitizer} className={field}>
            <option value="chlorine">Chlorine (liquid, tabs, shock)</option>
            <option value="swg">Salt water chlorinator</option>
          </select>
        </label>
        <label className={label}>
          Surface
          <select name="surface" defaultValue={current.surface} className={field}>
            {SURFACES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="covered" defaultChecked={current.covered} className="h-4 w-4 accent-lagoon" />
        Usually covered when not in use
      </label>
      <p className="text-xs text-muted">
        A new volume, sanitizer or cover changes the chlorine model and the plan; Tuffo works them out again after you
        save.
      </p>
      <div className="flex items-center gap-4">
        <button type="submit" disabled={pending} className={save}>
          {pending ? "Saving…" : "Save"}
        </button>
        <ResetButton />
      </div>
      <Status state={state} />
    </form>
  );
}

interface CurrentItem {
  model: string | null;
  details: Record<string, unknown>;
  since: string;
  /** YYYY-MM-DD, for the date field. */
  installedOn: string;
  summary: string;
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

function KindFields({ kind, current }: { kind: EquipmentKind; current: CurrentItem | null }) {
  const d = current?.details ?? {};
  const listed = kind === "pump" ? PUMP_MODELS.find((p) => p.id === d.catalog) : undefined;
  const [catalog, setCatalog] = useState(listed?.id ?? (current ? "other" : ""));

  if (kind === "pump") {
    return (
      <>
        <label className={label}>
          Pump
          <select name="catalog" value={catalog} onChange={(e) => setCatalog(e.target.value)} className={field}>
            <option value="" disabled>
              Choose…
            </option>
            {PUMP_MODELS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            <option value="other">Another pump</option>
          </select>
        </label>
        {catalog === "other" ? (
          <>
            <label className={label}>
              Make and model
              <input
                name="model"
                maxLength={80}
                defaultValue={current?.model ?? ""}
                placeholder="Sta-Rite IntelliPro"
                className={`${field} w-56`}
              />
            </label>
            <label className={label}>
              Speed
              <select name="speed" defaultValue={str(d.speed) || "variable"} className={field}>
                {PUMP_SPEEDS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}
      </>
    );
  }

  const types = kind === "feeder" ? FEEDER_TYPES : kind === "filter" ? FILTER_TYPES : HEATER_TYPES;
  const placeholder = { feeder: "Hayward CL200", filter: "Pentair Clean & Clear Plus 420", heater: "Hayward HeatPro" }[
    kind
  ];
  return (
    <>
      <label className={label}>
        Kind
        <select name="type" defaultValue={str(d.type)} required className={field}>
          <option value="" disabled>
            Choose…
          </option>
          {types.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      <label className={label}>
        Make and model (optional)
        <input
          name="model"
          maxLength={80}
          defaultValue={current?.model ?? ""}
          placeholder={placeholder}
          className={`${field} w-56`}
        />
      </label>
      {kind === "feeder" ? (
        <label className={label}>
          Setting (optional)
          <input
            name="setting"
            maxLength={40}
            defaultValue={str(d.setting)}
            placeholder="Dial 3, or 1 qt a day"
            className={`${field} w-44`}
          />
        </label>
      ) : null}
      {kind === "heater" ? (
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" name="in_use" defaultChecked={d.inUse === true} className="h-4 w-4 accent-lagoon" />
          In use now
        </label>
      ) : null}
    </>
  );
}

export interface CardFacts {
  /** "since Mar 4, 2022"; null when the install date is not known. */
  since: string | null;
  /** Age against a typical life, for the mini bar. */
  life: { share: number; tone: Tone; text: string } | null;
  /** The next maintenance task: "Next: hose off · Oct 31". */
  chip: { text: string; tone: Tone | null } | null;
  links: { href: string; label: string }[];
}

const CHIP_BG: Record<Tone, string> = {
  good: "bg-status-good/15",
  warning: "bg-status-warning/25",
  critical: "bg-status-critical/15",
};

/** The one card every piece of equipment uses: what it is, its age, what is next. */
function ItemCard({
  title,
  summary,
  facts,
  children,
}: {
  title: string;
  summary: string | null;
  facts: CardFacts;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
      <div className="flex flex-col gap-0.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <h3 className="font-semibold">{title}</h3>
          {facts.since ? <span className="text-xs text-muted">since {facts.since}</span> : null}
        </div>
        <p className="text-sm">{summary ?? <span className="text-muted">Not added</span>}</p>
      </div>
      {facts.life ? (
        <div className="flex items-center gap-3">
          <div className="w-24 shrink-0 sm:w-32">
            <IntervalBar share={facts.life.share} tone={facts.life.tone} text={`${title}: ${facts.life.text}`} />
          </div>
          <span className="text-xs text-muted">{facts.life.text}</span>
        </div>
      ) : null}
      {facts.chip ? (
        <p>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold text-foreground ${
              facts.chip.tone ? CHIP_BG[facts.chip.tone] : "bg-chart-grid/60"
            }`}
          >
            {facts.chip.tone ? <ToneIcon tone={facts.chip.tone} /> : null}
            {facts.chip.text}
          </span>
        </p>
      ) : null}
      {facts.links.length > 0 ? (
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {facts.links.map((l) => (
            <Link key={l.href} href={l.href} className="font-semibold text-lagoon underline-offset-2 hover:underline">
              {l.label}
            </Link>
          ))}
        </p>
      ) : null}
      {children}
    </div>
  );
}

const actionLink = "font-semibold text-lagoon underline-offset-2 hover:underline";

/** Add, fix the details of (no history entry) or replace (history entry) one item. */
function EquipmentForm({
  poolId,
  kind,
  mode,
  current,
  onCancel,
}: {
  poolId: string;
  kind: EquipmentKind;
  mode: "add" | "fix" | "replace";
  current: CurrentItem | null;
  onCancel: () => void;
}) {
  const [state, action, pending] = useActionState(saveEquipment, initial);
  const fix = mode === "fix" && current;
  return (
    <form action={action} className={`flex flex-col gap-3 ${mode === "add" ? "" : "border-t border-border pt-3"}`}>
      <input type="hidden" name="pool_id" value={poolId} />
      <input type="hidden" name="kind" value={kind} />
      {mode === "replace" ? <input type="hidden" name="replaced" value="on" /> : null}
      <p className="text-sm font-semibold">
        {mode === "add" ? `Add ${KIND_LABELS[kind].toLowerCase()}` : mode === "fix" ? "Fix details" : "The new one"}
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <KindFields kind={kind} current={fix ? current : null} />
        <label className={label}>
          {fix ? "Installed on" : "Installed on (empty = today)"}
          <input type="date" name="since" defaultValue={fix ? current.installedOn : ""} className={`${field} w-44`} />
        </label>
      </div>
      {mode === "replace" ? (
        <p className="text-xs text-muted">The old one stays in the history, from its install date to this one.</p>
      ) : null}
      <div className="flex items-center gap-4">
        <button type="submit" disabled={pending} className={save}>
          {pending ? "Saving…" : mode === "add" ? "Add" : "Save"}
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-muted underline-offset-2 hover:underline">
          Cancel
        </button>
      </div>
      <Status state={state} />
    </form>
  );
}

/** A piece of equipment that is there now: its card, "I replaced it" and "Fix details". */
export function EquipmentCard({
  poolId,
  kind,
  current,
  facts,
}: {
  poolId: string;
  kind: EquipmentKind;
  current: CurrentItem;
  facts: CardFacts;
}) {
  const [mode, setMode] = useState<"fix" | "replace" | null>(null);
  return (
    <ItemCard title={KIND_LABELS[kind]} summary={current.summary} facts={facts}>
      {mode === null ? (
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <button type="button" onClick={() => setMode("replace")} className={actionLink}>
            I replaced it
          </button>
          <button type="button" onClick={() => setMode("fix")} className={actionLink}>
            Fix details
          </button>
        </p>
      ) : (
        <>
          <EquipmentForm poolId={poolId} kind={kind} mode={mode} current={current} onCancel={() => setMode(null)} />
          {mode === "fix" ? (
            <form action={removeEquipment} className="flex flex-wrap items-center gap-2 text-sm text-muted">
              <input type="hidden" name="pool_id" value={poolId} />
              <input type="hidden" name="kind" value={kind} />
              No longer have it?
              <ConfirmButton
                question={`Remove the ${KIND_LABELS[kind].toLowerCase()}? It stays in the history, ending today.`}
                label={`Remove the ${KIND_LABELS[kind].toLowerCase()}`}
                className="rounded-md px-2 py-1 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50 dark:text-red-300 dark:hover:bg-red-950/40"
              />
            </form>
          ) : null}
        </>
      )}
    </ItemCard>
  );
}

/** The salt cell in the same card. Its current values live on the pool. */
export function CellCard({
  poolId,
  current,
  installedOn,
  summary,
  facts,
}: {
  poolId: string;
  current: { model: string | null; lbPerDay: number | null };
  installedOn: string | null;
  summary: string | null;
  facts: CardFacts;
}) {
  const known = current.lbPerDay !== null;
  const [mode, setMode] = useState<"fix" | "replace" | null>(known ? null : "fix");
  return (
    <ItemCard title="Salt cell" summary={summary} facts={facts}>
      {mode === null ? (
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <button type="button" onClick={() => setMode("replace")} className={actionLink}>
            I replaced it
          </button>
          <button type="button" onClick={() => setMode("fix")} className={actionLink}>
            Fix details
          </button>
        </p>
      ) : (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <p className="text-sm font-semibold">{!known ? "Which cell do you have?" : mode === "fix" ? "Fix details" : "The new cell"}</p>
          <CellForm
            poolId={poolId}
            current={current}
            mode={mode}
            installedOn={installedOn}
            onCancel={known ? () => setMode(null) : undefined}
          />
          {mode === "replace" ? (
            <p className="text-xs text-muted">The old cell stays in the history, from its install date to this one.</p>
          ) : null}
        </div>
      )}
    </ItemCard>
  );
}

/** Equipment not added yet, in one row: "Add: + Chlorine feeder + Heater". */
export function AddEquipmentRow({ poolId, kinds }: { poolId: string; kinds: EquipmentKind[] }) {
  const [adding, setAdding] = useState<EquipmentKind | null>(null);
  if (kinds.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="text-muted">Add:</span>
        {kinds.map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={adding === k}
            onClick={() => setAdding(adding === k ? null : k)}
            className={`${actionLink} inline-flex min-h-8 items-center gap-1`}
          >
            <span aria-hidden="true">+</span>
            {KIND_LABELS[k]}
          </button>
        ))}
      </p>
      {adding ? (
        <div className="rounded-2xl border border-border bg-surface p-4">
          <EquipmentForm key={adding} poolId={poolId} kind={adding} mode="add" current={null} onCancel={() => setAdding(null)} />
        </div>
      ) : null}
    </div>
  );
}

/** Deleting a pool: the owner types its name to confirm. */
export function DeletePoolForm({ poolId, name }: { poolId: string; name: string }) {
  const [state, action, pending] = useActionState(deletePool, {} as DeleteState);
  const [typed, setTyped] = useState("");
  const matches = typed.trim() === name.trim();
  return (
    <form action={action} className="flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50/40 p-4">
      <input type="hidden" name="pool_id" value={poolId} />
      <p className="text-sm">
        Deletes <strong>{name}</strong> and everything logged for it: tests, doses, events, the plan, equipment and
        alerts. This cannot be undone. To keep a copy first, use{" "}
        <Link href="/app/account" className="font-semibold text-lagoon underline-offset-2 hover:underline">
          Download my data
        </Link>{" "}
        on the account page.
      </p>
      <label className={label}>
        Type the pool&apos;s name to confirm
        <input
          name="confirm_name"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          className={`${field} w-56`}
        />
      </label>
      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={pending || !matches}
          className="h-10 self-start rounded-xl bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50"
        >
          {pending ? "Deleting…" : "Delete this pool"}
        </button>
        {typed ? (
          <button type="button" onClick={() => setTyped("")} className="text-sm text-muted underline-offset-2 hover:underline">
            Cancel
          </button>
        ) : null}
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
