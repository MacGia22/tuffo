"use client";

import { useActionState, useRef, useState } from "react";
import type { Units } from "@/lib/format";
import { createReading, type ReadingState } from "./actions";

const initial: ReadingState = {};

const input =
  "h-11 w-full rounded-xl border border-border bg-surface px-3 text-base text-foreground outline-none placeholder:text-muted/70 focus:border-lagoon focus:ring-2 focus:ring-lagoon/30";

interface Field {
  name: string;
  label: string;
  unit: string;
  placeholder: string;
  step: string;
}

const MAIN: Field[] = [
  { name: "fc", label: "Free chlorine", unit: "ppm", placeholder: "5.0", step: "0.1" },
  { name: "cc", label: "Combined chlorine", unit: "ppm", placeholder: "0.0", step: "0.1" },
  { name: "ph", label: "pH", unit: "", placeholder: "7.5", step: "0.05" },
  { name: "ta", label: "Alkalinity (TA)", unit: "ppm", placeholder: "70", step: "5" },
  { name: "ch", label: "Calcium (CH)", unit: "ppm", placeholder: "300", step: "10" },
  { name: "cya", label: "Stabilizer (CYA)", unit: "ppm", placeholder: "40", step: "5" },
];

const MORE: Field[] = [
  { name: "salt", label: "Salt", unit: "ppm", placeholder: "3200", step: "100" },
  { name: "borate", label: "Borates", unit: "ppm", placeholder: "0", step: "5" },
  { name: "phosphate", label: "Phosphates", unit: "ppb", placeholder: "0", step: "100" },
];

export function ReadingForm({ poolId, units, swg }: { poolId: string; units: Units; swg: boolean }) {
  const [state, action, pending] = useActionState(createReading, initial);
  const f = state.fields ?? {};
  const tzOffset = useRef<HTMLInputElement>(null);
  const [showMore, setShowMore] = useState(swg || Boolean(f.salt || f.borate || f.phosphate));

  const renderField = (field: Field) => (
    <div key={field.name} className="flex flex-col gap-1.5">
      <label htmlFor={field.name} className="text-sm font-semibold">
        {field.label} {field.unit ? <span className="font-normal text-muted">({field.unit})</span> : null}
      </label>
      <input
        id={field.name}
        name={field.name}
        inputMode="decimal"
        type="number"
        step={field.step}
        min={0}
        defaultValue={f[field.name] ?? ""}
        placeholder={field.placeholder}
        className={input}
      />
    </div>
  );

  return (
    <form
      action={action}
      onSubmit={() => {
        // datetime-local carries no zone; send the browser's offset so the server can place it.
        if (tzOffset.current) tzOffset.current.value = String(new Date().getTimezoneOffset());
      }}
      className="flex max-w-2xl flex-col gap-6"
    >
      <input type="hidden" name="pool_id" value={poolId} />
      <input type="hidden" name="units" value={units} />
      <input type="hidden" name="tz_offset" ref={tzOffset} defaultValue="0" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{MAIN.map(renderField)}</div>

      {showMore ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{MORE.map(renderField)}</div>
      ) : (
        <button type="button" onClick={() => setShowMore(true)} className="self-start text-sm font-semibold text-lagoon">
          + Salt, borates, phosphates
        </button>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="water_temp" className="text-sm font-semibold">
            Water temperature <span className="font-normal text-muted">({units === "us" ? "°F" : "°C"})</span>
          </label>
          <input
            id="water_temp"
            name="water_temp"
            type="number"
            inputMode="decimal"
            step="1"
            defaultValue={f.water_temp ?? ""}
            placeholder={units === "us" ? "84" : "29"}
            className={input}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="method" className="text-sm font-semibold">
            Tested with
          </label>
          <select id="method" name="method" defaultValue={f.method ?? "drop_kit"} className={input}>
            <option value="drop_kit">Drop test kit</option>
            <option value="strips">Test strips</option>
            <option value="digital">Digital tester</option>
            <option value="store_leslies">Leslie&apos;s store test</option>
            <option value="store_pinch">Pinch A Penny store test</option>
            <option value="monitor">Smart monitor</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="taken_at" className="text-sm font-semibold">
            When <span className="font-normal text-muted">(empty = now)</span>
          </label>
          <input id="taken_at" name="taken_at" type="datetime-local" defaultValue={f.taken_at ?? ""} className={input} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="notes" className="text-sm font-semibold">
          Notes <span className="font-normal text-muted">(optional)</span>
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={2}
          maxLength={2000}
          defaultValue={f.notes ?? ""}
          placeholder="Cloudy after the party; added 2 gal chlorine yesterday"
          className="rounded-xl border border-border bg-surface px-3 py-2 text-base outline-none focus:border-lagoon focus:ring-2 focus:ring-lagoon/30"
        />
      </div>

      {state.error ? (
        <p role="alert" className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="h-12 self-start rounded-xl bg-lagoon px-6 text-base font-semibold text-white transition hover:bg-lagoon-deep disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save test"}
      </button>
    </form>
  );
}
