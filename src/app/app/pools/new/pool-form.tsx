"use client";

import { CancelLink } from "@/components/form-cancel";

import { useActionState, useState } from "react";
import { PlacePicker } from "@/components/place-picker";
import { useBrowserUnits } from "@/components/use-browser-units";
import { unitsForCountry } from "@/lib/browser-units";
import type { Units } from "@/lib/format";
import type { PoolPrefill } from "@/lib/forecast/prefill";
import { createPool, findPlaces, type CreatePoolState } from "./actions";

const initial: CreatePoolState = {};

const input =
  "h-11 w-full rounded-xl border border-border-input bg-surface px-3 text-base text-foreground outline-none placeholder:text-muted/70 focus:border-lagoon focus:ring-2 focus:ring-lagoon/30";
const label = "text-sm font-semibold";

/** `defaultUnits` null (no profile setting): the browser's likely units. */
export function PoolForm({ defaultUnits, prefill = null }: { defaultUnits: Units | null; prefill?: PoolPrefill | null }) {
  const [state, action, pending] = useActionState(createPool, initial);
  const f = state.fields ?? prefill?.fields ?? {};

  // Units: what the person picks, else (the profile's, else) the pool's country once a town
  // is picked, else the browser's.
  const browserUnits = useBrowserUnits();
  const [picked, setUnits] = useState<Units | null>((f.units as Units) || defaultUnits);
  const [placeUnits, setPlaceUnits] = useState<Units | null>(null);
  const units = picked ?? placeUnits ?? browserUnits;

  return (
    <form action={action} className="flex max-w-xl flex-col gap-6">
      {prefill ? (
        <p className="rounded-xl border border-lagoon/40 bg-lagoon/5 px-4 py-3 text-sm">
          Filled in from your forecast for {prefill.fields.place_label ?? prefill.fields.query}. Check it and give the pool a
          name.
          {prefill.cya !== null
            ? ` Your forecast used stabilizer ${prefill.cya} ppm: log it with your first test so the plan uses your own number.`
            : ""}
        </p>
      ) : null}
      <input type="hidden" name="units" value={units} />

      <fieldset className="flex flex-col gap-3 rounded-2xl border border-border p-4">
        <legend className="px-1 text-sm font-semibold">Where the pool is</legend>
        <p className="text-xs text-muted">
          Type a ZIP or postal code, or a town (&ldquo;St. Petersburg, FL&rdquo;). Tuffo keeps only a 3 km (2 mile) weather
          cell and the town name; no address is asked for or stored, and nothing finer would be used anyway.
        </p>
        <PlacePicker
          find={findPlaces}
          onPlace={(place) => setPlaceUnits(unitsForCountry(place.country))}
          initialQuery={f.query ?? ""}
          initialPlace={
            f.lat && f.lon && f.timezone && f.place_label
              ? { label: f.place_label, lat: Number(f.lat), lon: Number(f.lon), timezone: f.timezone, country: "" }
              : null
          }
        />
      </fieldset>

      <div className="flex flex-col gap-2">
        <label htmlFor="name" className={label}>
          Pool name
        </label>
        <input id="name" name="name" required maxLength={80} defaultValue={f.name ?? ""} placeholder="Backyard pool" className={input} />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="volume" className={label}>
          Volume
        </label>
        <div className="flex gap-2">
          <input
            id="volume"
            name="volume"
            required
            inputMode="decimal"
            defaultValue={f.volume ?? ""}
            placeholder={units === "us" ? "15,000" : "55,000"}
            className={input}
          />
          <select
            aria-label="Volume unit"
            value={units}
            onChange={(e) => setUnits(e.target.value as Units)}
            className="h-11 rounded-xl border border-border-input bg-surface px-3 text-base"
          >
            <option value="us">gallons</option>
            <option value="metric">liters</option>
          </select>
        </div>
        <p className="text-xs text-muted">
          Not sure? Length × width × average depth: in feet × 7.5 gives gallons; in meters × 1,000 gives liters.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label htmlFor="sanitizer" className={label}>
            Sanitizer
          </label>
          <select id="sanitizer" name="sanitizer" defaultValue={f.sanitizer ?? "chlorine"} className={`${input} h-11`}>
            <option value="chlorine">Chlorine (liquid, tabs, shock)</option>
            <option value="swg">Salt water chlorinator</option>
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="surface" className={label}>
            Surface
          </label>
          <select id="surface" name="surface" defaultValue={f.surface ?? "plaster"} className={`${input} h-11`}>
            <option value="plaster">Plaster, pebble or tile</option>
            <option value="vinyl">Vinyl liner</option>
            <option value="fiberglass">Fiberglass</option>
          </select>
        </div>
      </div>

      <label className="flex items-center gap-3 text-sm">
        <input type="checkbox" name="covered" defaultChecked={f.covered === "on"} className="h-4 w-4 accent-lagoon" />
        Usually covered when not in use
      </label>


      {state.error ? (
        <p role="alert" className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="h-12 rounded-xl bg-action px-5 text-base font-semibold text-white transition hover:bg-action-deep disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save pool"}
        </button>
        <CancelLink href="/app" />
      </div>
    </form>
  );
}
