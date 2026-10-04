"use client";

import { FieldError } from "@/components/field-error";
import Link from "next/link";
import { ConfirmButton } from "@/components/confirm-button";
import { ResetButton } from "@/components/form-cancel";
import { IntervalBar, ToneIcon } from "@/components/maintenance-visuals";
import { CellForm, type CurrentCell } from "@/components/salt-cell-form";
import { InstallDateField } from "@/components/install-date-field";
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
import { ENCLOSURES, suggestedSunPct, type EnclosureKind } from "@/lib/enclosure";
import type { Units } from "@/lib/format";
import type { Tone } from "@/lib/maintenance";
import { SPEED_UNITS } from "@/lib/pump";
import { groupByRegion } from "@/lib/region";
import { useRegion } from "@/components/region-context";
import {
  deletePool,
  removeEquipment,
  saveEnclosure,
  saveEquipment,
  savePoolBasics,
  type DeleteState,
  type SettingsState,
} from "../actions";

const initial: SettingsState = {};
const field = "h-11 rounded-xl border border-border-input bg-surface px-3 text-base text-foreground outline-none focus:border-lagoon focus:ring-2 focus:ring-lagoon/30";
const label = "flex flex-col gap-1 text-xs text-muted";
const save =
  "h-11 self-start rounded-xl bg-action px-4 text-sm font-semibold text-white hover:bg-action-deep disabled:opacity-60";

function Status({ state, fields = [] }: { state: SettingsState; fields?: string[] }) {
  if (state.error && state.field && fields.includes(state.field)) return null;
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
          <input
            name="name"
            required
            maxLength={80}
            defaultValue={current.name}
            aria-invalid={state.field === "name" || undefined}
            aria-describedby={state.field === "name" ? "name-error" : undefined}
            className={`${field} w-56`}
          />
          <FieldError state={state} name="name" />
        </label>
        <label className={label}>
          Volume ({units === "us" ? "gallons" : "liters"})
          <input
            name="volume"
            required
            inputMode="decimal"
            defaultValue={current.volume}
            aria-invalid={state.field === "volume" || undefined}
            aria-describedby={state.field === "volume" ? "volume-error" : undefined}
            className={`${field} w-36`}
          />
          <FieldError state={state} name="volume" />
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
      <Status state={state} fields={["name", "volume"]} />
    </form>
  );
}

/**
 * A screen enclosure ("pool cage") shades the water: the kind suggests the share of the
 * sun that gets through, and the owner can type their own.
 */
export function EnclosureForm({
  poolId,
  current,
}: {
  poolId: string;
  current: { enclosure: EnclosureKind | null; sunPct: number | null };
}) {
  const [state, action, pending] = useActionState(saveEnclosure, initial);
  const [kind, setKind] = useState<EnclosureKind | "none">(current.enclosure ?? "none");
  const [pct, setPct] = useState(current.sunPct === null ? "" : String(current.sunPct));
  const suggested = kind === "none" ? null : suggestedSunPct(kind);
  return (
    <form action={action} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
      <input type="hidden" name="pool_id" value={poolId} />
      <div className="flex flex-wrap gap-3">
        <label className={label}>
          Screen enclosure (pool cage)
          <select
            name="enclosure"
            value={kind}
            onChange={(e) => {
              const next = e.target.value as EnclosureKind | "none";
              setKind(next);
              setPct(next === "none" ? "" : String(suggestedSunPct(next)));
            }}
            className={field}
          >
            <option value="none">None</option>
            {ENCLOSURES.map((e) => (
              <option key={e.value} value={e.value}>
                {e.label}
              </option>
            ))}
          </select>
        </label>
        {kind !== "none" ? (
          <label className={label}>
            Sun that gets through (%)
            <input
              name="sun_pct"
              inputMode="numeric"
              value={pct}
              onChange={(e) => setPct(e.target.value)}
              placeholder={String(suggested)}
              aria-invalid={state.field === "sun_pct" || undefined}
              aria-describedby={state.field === "sun_pct" ? "sun_pct-error" : undefined}
              className={`${field} w-28`}
            />
            <FieldError state={state} name="sun_pct" />
          </label>
        ) : null}
      </div>
      <p className="text-xs text-muted">
        {kind === "none"
          ? "A screen over the pool blocks part of the sun, the main thing that uses up chlorine. Rain still gets through."
          : `About ${suggested}% is typical for this screen. Change it if your pool is more or less shaded; Tuffo also learns from your tests.`}
      </p>
      <div className="flex items-center gap-4">
        <button type="submit" disabled={pending} className={save}>
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      <Status state={state} fields={["sun_pct"]} />
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
  const region = useRegion();

  if (kind === "pump") {
    return (
      <>
        <label className={label}>
          Pump
          <select name="catalog" value={catalog} onChange={(e) => setCatalog(e.target.value)} className={field}>
            <option value="" disabled>
              Choose…
            </option>
            {groupByRegion(PUMP_MODELS, region).map((group) => {
              const options = group.items.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ));
              return group.label ? (
                <optgroup key={group.label} label={group.label}>
                  {options}
                </optgroup>
              ) : (
                options
              );
            })}
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
            <label className={label}>
              Its runs are set by
              <select name="unit" defaultValue={str(d.unit) || "rpm"} className={field}>
                {SPEED_UNITS.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
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
  /** Upkeep logged before this item's install date: likely a wrong date. */
  warning: string | null;
}

const CHIP_BG: Record<Tone, string> = {
  good: "bg-chip-ok-bg text-chip-ok-fg",
  warning: "bg-chip-warn-bg text-chip-warn-fg",
  critical: "bg-chip-critical-bg text-chip-critical-fg",
};

/** The one card every piece of equipment uses: what it is, its age, what is next. */
function ItemCard({
  id,
  title,
  summary,
  facts,
  onEdit,
  children,
}: {
  id: string;
  title: string;
  summary: string | null;
  facts: CardFacts;
  /** Tapping the item opens Fix details; null while a form is open. */
  onEdit: (() => void) | null;
  children: React.ReactNode;
}) {
  const head = (
    <>
      <span className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="font-semibold">{title}</span>
        {facts.since ? <span className="text-xs text-muted">since {facts.since}</span> : null}
      </span>
      <span className="block text-sm">{summary ?? <span className="text-muted">Not added</span>}</span>
    </>
  );
  return (
    <div id={id} className="flex scroll-mt-20 flex-col gap-3 rounded-2xl border border-border bg-surface p-4 target:ring-2 target:ring-lagoon/40">
      <h3>
        {onEdit ? (
          <button
            type="button"
            onClick={onEdit}
            aria-label={`${title}: edit details`}
            className="-m-1 flex w-[calc(100%+0.5rem)] flex-col gap-0.5 rounded-lg p-1 text-left hover:bg-lagoon/5"
          >
            {head}
          </button>
        ) : (
          <span className="flex flex-col gap-0.5">{head}</span>
        )}
      </h3>
      {facts.warning ? (
        <p className="flex items-start gap-1.5 rounded-lg bg-chip-warn-bg px-2.5 py-1.5 text-xs text-chip-warn-fg">
          <ToneIcon tone="warning" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{facts.warning}</span>
        </p>
      ) : null}
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
        <InstallDateField
          defaultValue={fix ? current.installedOn : ""}
          hint={mode === "replace" ? "(empty = today)" : undefined}
        />
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
    <ItemCard
      id={`equip-${kind}`}
      title={KIND_LABELS[kind]}
      summary={current.summary}
      facts={facts}
      onEdit={mode === null ? () => setMode("fix") : null}
    >
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
  current: CurrentCell;
  installedOn: string | null;
  summary: string | null;
  facts: CardFacts;
}) {
  const known = current.lbPerDay !== null;
  const [mode, setMode] = useState<"fix" | "replace" | null>(known ? null : "fix");
  return (
    <ItemCard
      id="equip-cell"
      title="Salt cell"
      summary={summary}
      facts={facts}
      onEdit={mode === null ? () => setMode("fix") : null}
    >
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
