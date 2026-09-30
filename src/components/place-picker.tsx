"use client";

import { useState, useTransition } from "react";
import type { Place } from "@/lib/weather/geocode";

const input =
  "h-11 w-full rounded-xl border border-border bg-surface px-3 text-base text-foreground outline-none placeholder:text-muted/70 focus:border-lagoon focus:ring-2 focus:ring-lagoon/30";

/**
 * Town or ZIP search for a pool's weather. Adds hidden lat, lon, timezone, place_label
 * and query fields to the surrounding form once a place is picked; the server keeps
 * only the weather cell, the label and the time zone.
 */
export function PlacePicker({
  find,
  initialQuery = "",
  initialPlace = null,
}: {
  find: (query: string) => Promise<{ places: Place[]; error?: string }>;
  initialQuery?: string;
  initialPlace?: Place | null;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [places, setPlaces] = useState<Place[]>([]);
  const [searchError, setSearchError] = useState<string>();
  const [place, setPlace] = useState<Place | null>(initialPlace);
  const [searching, startSearch] = useTransition();

  function search() {
    const q = query.trim();
    if (q.length < 2) return;
    startSearch(async () => {
      const result = await find(q);
      setSearchError(
        result.error ??
          (result.places.length === 0 ? "Nothing found. Try the ZIP code, or the town and state." : undefined),
      );
      setPlaces(result.places);
    });
  }

  return (
    <>
      <input type="hidden" name="query" value={query} />
      {place ? (
        <>
          <input type="hidden" name="lat" value={place.lat} />
          <input type="hidden" name="lon" value={place.lon} />
          <input type="hidden" name="timezone" value={place.timezone} />
          <input type="hidden" name="place_label" value={place.label} />
        </>
      ) : null}
      <div className="flex gap-2">
        <input
          aria-label="Town or ZIP code"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              search();
            }
          }}
          placeholder="33710 or St. Petersburg, FL"
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
    </>
  );
}
