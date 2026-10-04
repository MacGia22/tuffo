"use client";

import { useState, useTransition, type ReactNode } from "react";
import { CellMap } from "@/components/cell-map";
import { CELL_DEGREES, cellFor, cellNear, wrapLon, type WeatherCell } from "@/lib/weather/cells";
import type { Place } from "@/lib/weather/geocode";
import { placesFoundText } from "@/lib/weather/place-order";

const input =
  "h-11 w-full rounded-xl border border-border-input bg-surface px-3 text-base text-foreground outline-none placeholder:text-muted/70 focus:border-lagoon focus:ring-2 focus:ring-lagoon/30";

/**
 * Town or ZIP search for a pool's weather, then a map of the weather squares around the
 * town to pick the one the pool is in (the town's own square by default). Adds hidden
 * lat and lon (the square's center, never the point tapped), timezone, place_label and
 * query fields to the surrounding form; the server keeps only the square, the label and
 * the time zone. With `onPick` (the public forecast), picking a town hands over its own
 * square straight away, with no map.
 */
export function PlacePicker({
  find,
  initialQuery = "",
  initialPlace = null,
  onPick,
  autoFocus = false,
  label = "Town or ZIP code",
  primaryFind = false,
  note,
  onPlace,
}: {
  find: (query: string) => Promise<{ places: Place[]; error?: string }>;
  initialQuery?: string;
  initialPlace?: Place | null;
  onPick?: (place: Place, cell: WeatherCell) => void;
  autoFocus?: boolean;
  /** The search field's visible label. */
  label?: string;
  /** "Find" as the page's filled button (the public forecast box). */
  primaryFind?: boolean;
  /** Shown under the field (the forecast box's privacy line). */
  note?: ReactNode;
  /** Told about the town picked (the new-pool form sets units from its country). */
  onPlace?: (place: Place) => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [places, setPlaces] = useState<Place[]>([]);
  const [searchError, setSearchError] = useState<string>();
  const [place, setPlaceState] = useState<Place | null>(initialPlace);
  const [cell, setCell] = useState<WeatherCell | null>(initialPlace ? cellFor(initialPlace.lat, initialPlace.lon) : null);
  const [searching, startSearch] = useTransition();
  const [status, setStatus] = useState("");

  function setPlace(p: Place) {
    setPlaceState(p);
    setCell(cellFor(p.lat, p.lon));
    onPlace?.(p);
    onPick?.(p, cellFor(p.lat, p.lon));
  }

  /** Keyboard alternative to tapping: move the picked square one step. */
  function nudge(dLat: number, dLon: number) {
    if (!place || !cell) return;
    const lat = cell.lat + dLat * CELL_DEGREES;
    if (Math.abs(lat) > 90) return;
    // West of −180 is 180 again.
    const next = cellFor(lat, wrapLon(cell.lon + dLon * CELL_DEGREES));
    if (cellNear(next, place)) setCell(next);
  }

  function search() {
    const q = query.trim();
    if (q.length < 2) return;
    startSearch(async () => {
      const result = await find(q);
      setSearchError(result.error);
      setStatus(result.error ? "" : placesFoundText(result.places.length));
      // Already in order: the visitor's country, then the US, then the rest (server side).
      setPlaces(result.places);
    });
  }

  return (
    <>
      <input type="hidden" name="query" value={query} />
      {place && cell && !onPick ? (
        <>
          <input type="hidden" name="lat" value={cell.lat} />
          <input type="hidden" name="lon" value={cell.lon} />
          <input type="hidden" name="timezone" value={place.timezone} />
          <input type="hidden" name="place_label" value={place.label} />
        </>
      ) : null}
      <label htmlFor="place-query" className="text-sm font-semibold">
        {label}
      </label>
      <div className="flex gap-2">
        <input
          id="place-query"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              search();
            }
          }}
          placeholder="33710 or St. Petersburg, FL"
          autoFocus={autoFocus}
          enterKeyHint="search"
          className={input}
        />
        <button
          type="button"
          onClick={search}
          disabled={searching}
          className={
            primaryFind
              ? "h-11 shrink-0 rounded-xl bg-action px-5 text-sm font-semibold text-white hover:bg-lagoon-deep disabled:opacity-60"
              : "h-11 shrink-0 rounded-xl border border-border-input px-4 text-sm font-semibold hover:border-lagoon disabled:opacity-60"
          }
        >
          {searching ? "Searching…" : "Find"}
        </button>
      </div>
      {note}
      {searchError ? <p className="text-sm text-red-600">{searchError}</p> : null}
      <p role="status" className={status ? "text-sm text-muted" : "sr-only"}>
        {status}
      </p>
      {places.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {places.map((p) => {
            const selected = place?.lat === p.lat && place?.lon === p.lon;
            return (
              <li key={`${p.lat},${p.lon}`}>
                <button
                  type="button"
                  onClick={() => setPlace(p)}
                  aria-pressed={selected}
                  className={`flex min-h-11 w-full items-center rounded-lg px-3 py-2 text-left text-sm ${
                    selected ? "bg-action text-white" : "hover:bg-ice/30"
                  }`}
                >
                  {p.label}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      {place && cell && !onPick ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm">
            Using weather for <span className="font-semibold">{place.label}</span> ({place.timezone}). The shaded square
            is the area Tuffo uses; tap the square your pool is in if it is another one.
          </p>
          <CellMap key={`${place.lat},${place.lon}`} center={place} cell={cell} onPick={setCell} />
          <div className="flex flex-wrap items-center gap-1 text-xs text-muted">
            <span className="mr-1">Move the square:</span>
            {(
              [
                ["North", 1, 0],
                ["South", -1, 0],
                ["West", 0, -1],
                ["East", 0, 1],
              ] as const
            ).map(([label, dLat, dLon]) => (
              <button
                key={label}
                type="button"
                onClick={() => nudge(dLat, dLon)}
                className="rounded-lg border border-border px-2 py-1 font-semibold text-foreground hover:border-lagoon"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}
