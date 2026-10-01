"use client";

import Link from "next/link";
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
import { removeEquipment, saveEquipment, savePoolBasics, type SettingsState } from "../actions";

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
      <button type="submit" disabled={pending} className={save}>
        {pending ? "Saving…" : "Save"}
      </button>
      <Status state={state} />
    </form>
  );
}

interface CurrentItem {
  model: string | null;
  details: Record<string, unknown>;
  since: string;
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

/** One kind of equipment: what is there now, a form to correct or replace it, and remove. */
export function EquipmentCard({
  poolId,
  kind,
  current,
  scheduleHref,
}: {
  poolId: string;
  kind: EquipmentKind;
  current: CurrentItem | null;
  scheduleHref: string | null;
}) {
  const [state, action, pending] = useActionState(saveEquipment, initial);
  const [open, setOpen] = useState(false);
  const [replaced, setReplaced] = useState(false);

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">{KIND_LABELS[kind]}</h3>
        <p className="text-sm">
          {current ? (
            <>
              {current.summary} <span className="text-muted">· since {current.since}</span>
            </>
          ) : (
            <span className="text-muted">Not added</span>
          )}
        </p>
      </div>
      {scheduleHref ? (
        <p className="text-sm">
          <Link href={scheduleHref} className="font-semibold text-lagoon underline-offset-2 hover:underline">
            Pump schedule
          </Link>
        </p>
      ) : null}
      {!open && !current ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="self-start text-sm font-semibold text-lagoon underline-offset-2 hover:underline"
        >
          Add
        </button>
      ) : open ? (
        <form action={action} className="flex flex-col gap-3">
          <input type="hidden" name="pool_id" value={poolId} />
          <input type="hidden" name="kind" value={kind} />
          <div className="flex flex-wrap items-end gap-3">
            <KindFields kind={kind} current={current} />
          </div>
          {current ? (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="replaced"
                checked={replaced}
                onChange={(e) => setReplaced(e.target.checked)}
                className="h-4 w-4 accent-lagoon"
              />
              I replaced it (keep the old one in the history)
            </label>
          ) : null}
          {!current || replaced ? (
            <label className={label}>
              Installed on (leave empty for today)
              <input type="date" name="since" className={`${field} w-44`} />
            </label>
          ) : null}
          <button type="submit" disabled={pending} className={save}>
            {pending ? "Saving…" : current ? "Save" : "Add"}
          </button>
          <Status state={state} />
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="font-semibold text-lagoon underline-offset-2 hover:underline"
          >
            Change
          </button>
          <form action={removeEquipment}>
            <input type="hidden" name="pool_id" value={poolId} />
            <input type="hidden" name="kind" value={kind} />
            <button type="submit" className="text-muted underline-offset-2 hover:underline">
              Remove
            </button>
          </form>
          <Status state={state} />
        </div>
      )}
    </div>
  );
}
