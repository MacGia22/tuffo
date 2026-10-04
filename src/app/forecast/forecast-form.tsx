"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { PlacePicker } from "@/components/place-picker";
import { useBrowserUnits } from "@/components/use-browser-units";
import { defaultUnits, defaultVolumeL, forecastHref, type ForecastInput, type Sanitizer } from "@/lib/forecast/params";
import type { Units } from "@/lib/format";
import type { Place } from "@/lib/weather/geocode";
import { findForecastPlaces } from "./actions";

const LITERS_PER_US_GALLON = 3.785411784;
const input =
  "h-11 w-full rounded-xl border border-border-input bg-surface px-3 text-base text-foreground outline-none placeholder:text-muted/70 focus:border-lagoon focus:ring-2 focus:ring-lagoon/30";
const label = "text-sm font-semibold";

function displayVolume(liters: number, units: Units): string {
  const v = units === "us" ? liters / LITERS_PER_US_GALLON : liters;
  // Whole gallons or liters: rounding to 100 turned a 450 gal spa into 400 on "Update".
  return String(Math.round(v));
}

function toLiters(value: string, units: Units): number | null {
  const v = Number(value.replace(/,/g, ""));
  if (!value.trim() || !Number.isFinite(v)) return null;
  return Math.round(units === "us" ? v * LITERS_PER_US_GALLON : v);
}

/**
 * Town or ZIP, then optional pool details. Picking a town opens its week straight away;
 * the details update it. Everything goes into the URL, coordinates as the weather cell.
 */
export function ForecastForm({
  current,
  refLabel,
  autoFocus = false,
}: {
  current: ForecastInput | null;
  refLabel: string | null;
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [units, setUnits] = useState<Units | null>(current?.units ?? null);
  // Before a pick, the browser's likely units (metric in Australia or outside en-US).
  const browserUnits = useBrowserUnits();
  const shownUnits: Units = units ?? browserUnits;
  const [volume, setVolume] = useState(current ? displayVolume(current.volumeL, current.units) : "");
  const [cya, setCya] = useState(current ? String(current.cya) : "");
  const [sanitizer, setSanitizer] = useState<Sanitizer>(current?.sanitizer ?? "chlorine");

  function go(place: { label: string; lat: number; lon: number }, pickedUnits: Units | null) {
    // A volume typed in the units on screen keeps them; otherwise the place decides.
    const u = pickedUnits ?? (volume.trim() ? shownUnits : defaultUnits(place.label));
    const volumeL = toLiters(volume, u) ?? defaultVolumeL(u);
    const cyaValue = cya.trim() === "" ? 40 : Number(cya);
    // The home page is static: it reads the ?ref= of the link that brought the visitor here.
    const ref = refLabel ?? new URLSearchParams(window.location.search).get("ref");
    const href = forecastHref(
      { place: place.label, lat: place.lat, lon: place.lon, volumeL, cya: cyaValue, sanitizer, units: u },
      { ref },
    );
    startTransition(() => router.push(href));
  }

  function changeUnits(next: Units) {
    const liters = toLiters(volume, shownUnits);
    if (liters !== null) setVolume(displayVolume(liters, next));
    setUnits(next);
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (current) go({ label: current.place, lat: current.lat, lon: current.lon }, units);
      }}
    >
      <div className="flex flex-col gap-2">
        <PlacePicker
          find={findForecastPlaces}
          autoFocus={autoFocus}
          label={current ? "Another town" : "Your town or ZIP code"}
          primaryFind={!current}
          note={
            current ? null : (
              <p className="text-xs text-muted">
                No ads, no tracking. Tuffo keeps nothing about this search; the link holds only the town and a weather
                area about 3 km (2 miles) across.
              </p>
            )
          }
          onPick={(place: Place, cell) => go({ label: place.label, lat: cell.lat, lon: cell.lon }, units)}
        />
      </div>

      <details id={current ? "pool-details" : undefined} className="rounded-2xl border border-border p-4">
        <summary className="cursor-pointer text-sm font-semibold">
          Your pool (optional): {current ? "change volume, stabilizer or salt" : `${shownUnits === "us" ? "15,000 gal" : "57,000 L"}, stabilizer 40, chlorine`}
        </summary>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-2">
            <label htmlFor="forecast-volume" className={label}>
              Volume
            </label>
            <div className="flex gap-2">
              <input
                id="forecast-volume"
                inputMode="numeric"
                value={volume}
                onChange={(e) => setVolume(e.target.value)}
                placeholder={shownUnits === "us" ? "15000" : "57000"}
                className={input}
              />
              <select
                aria-label="Volume unit"
                value={shownUnits}
                onChange={(e) => changeUnits(e.target.value as Units)}
                className="h-11 rounded-xl border border-border-input bg-surface px-2 text-base"
              >
                <option value="us">gal</option>
                <option value="metric">L</option>
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="forecast-cya" className={label}>
              Stabilizer (CYA), ppm
            </label>
            <input
              id="forecast-cya"
              inputMode="numeric"
              value={cya}
              onChange={(e) => setCya(e.target.value)}
              placeholder="40"
              className={input}
            />
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className={label}>Sanitizer</legend>
            <div className="flex gap-2">
              {(
                [
                  ["chlorine", "Chlorine"],
                  ["salt", "Salt cell"],
                ] as const
              ).map(([value, text]) => (
                <label
                  key={value}
                  className={`flex h-11 flex-1 cursor-pointer items-center justify-center rounded-xl border text-sm font-semibold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-lagoon has-[:focus-visible]:outline ${
                    sanitizer === value ? "border-lagoon bg-lagoon/10 text-lagoon" : "border-border"
                  }`}
                >
                  <input
                    type="radio"
                    name="sanitizer"
                    value={value}
                    checked={sanitizer === value}
                    onChange={() => setSanitizer(value)}
                    className="sr-only"
                  />
                  {text}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
        {current ? (
          <button
            type="submit"
            disabled={pending}
            className="mt-4 h-11 rounded-xl bg-action px-5 text-sm font-semibold text-white hover:bg-action-deep disabled:opacity-60"
          >
            Update the week
          </button>
        ) : null}
      </details>
      {pending ? (
        <p role="status" className="text-sm text-muted">
          Loading the week…
        </p>
      ) : null}
    </form>
  );
}
