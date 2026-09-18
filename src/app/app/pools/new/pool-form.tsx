"use client";

import { useActionState, useState, useTransition } from "react";
import type { Place } from "@/lib/weather/geocode";
import type { Units } from "@/lib/format";
import { createPool, findPlaces, type CreatePoolState } from "./actions";

const initial: CreatePoolState = {};

const input =
  "h-11 w-full rounded-xl border border-border bg-surface px-3 text-base text-foreground outline-none placeholder:text-muted/70 focus:border-lagoon focus:ring-2 focus:ring-lagoon/30";
const label = "text-sm font-semibold";

export function PoolForm({ defaultUnits }: { defaultUnits: Units }) {
  const [state, action, pending] = useActionState(createPool, initial);
  const f = state.fields ?? {};

  const [units, setUnits] = useState<Units>((f.units as Units) || defaultUnits);
  const [query, setQuery] = useState(f.query ?? "");
  const [places, setPlaces] = useState<Place[]>([]);
  const [searchError, setSearchError] = useState<string>();
  const [place, setPlace] = useState<Place | null>(
    f.lat && f.lon && f.timezone && f.place_label
      ? { label: f.place_label, lat: Number(f.lat), lon: Number(f.lon), timezone: f.timezone, country: "" }
      : null,
  );
  const [searching, startSearch] = useTransition();

  function search() {
    const q = query.trim();
    if (q.length < 2) return;
    startSearch(async () => {
      const result = await findPlaces(q);
      setSearchError(result.error ?? (result.places.length === 0 ? "No town found with that name." : undefined));
      setPlaces(result.places);
    });
  }

  return (
    <form action={action} className="flex max-w-xl flex-col gap-6">
      <input type="hidden" name="units" value={units} />
      <input type="hidden" name="query" value={query} />
      {place ? (
        <>
          <input type="hidden" name="lat" value={place.lat} />
          <input type="hidden" name="lon" value={place.lon} />
          <input type="hidden" name="timezone" value={place.timezone} />
          <input type="hidden" name="place_label" value={place.label} />
        </>
      ) : null}

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
            className="h-11 rounded-xl border border-border bg-surface px-3 text-base"
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

      <fieldset className="flex flex-col gap-3 rounded-2xl border border-border p-4">
        <legend className="px-1 text-sm font-semibold">Location for weather</legend>
        <p className="text-xs text-muted">
          Type your town. Tuffo keeps only a 5 km weather cell and the town name, never an address.
        </p>
        <div className="flex gap-2">
          <input
            aria-label="Town"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                search();
              }
            }}
            placeholder="St. Petersburg, Florida"
            className={input}
          />
          <button
            type="button"
            onClick={search}
            disabled={searching}
            className="h-11 shrink-0 rounded-xl border border-border px-4 text-sm font-semibold hover:border-lagoon disabled:opacity-60"
          >
            {searching ? "Searching…" : "Find"}
          </button>
        </div>
        {searchError ? <p className="text-sm text-red-600">{searchError}</p> : null}
        {places.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {places.map((p) => {
              const selected = place?.lat === p.lat && place?.lon === p.lon;
              return (
                <li key={`${p.lat},${p.lon}`}>
                  <button
                    type="button"
                    onClick={() => setPlace(p)}
                    className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                      selected ? "bg-lagoon text-white" : "hover:bg-ice/30"
                    }`}
                  >
                    {p.label}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
        {place ? (
          <p className="text-sm">
            Using weather for <span className="font-semibold">{place.label}</span> ({place.timezone}).
          </p>
        ) : null}
      </fieldset>

      {state.error ? (
        <p role="alert" className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="h-12 rounded-xl bg-lagoon px-5 text-base font-semibold text-white transition hover:bg-lagoon-deep disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save pool"}
      </button>
    </form>
  );
}
