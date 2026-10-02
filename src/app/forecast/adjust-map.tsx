"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { forecastHref, type ForecastInput } from "@/lib/forecast/params";
import { cellFor, type WeatherCell } from "@/lib/weather/cells";

// Leaflet, its styles and the map tiles load only after "Adjust on the map" is tapped.
const CellMap = dynamic(() => import("@/components/cell-map").then((m) => m.CellMap), {
  ssr: false,
  loading: () => <p className="flex h-72 items-center justify-center rounded-xl border border-border text-sm text-muted">Loading the map…</p>,
});

/**
 * "Wrong area? Adjust on the map": on tap, the weather squares around this forecast's
 * square. Tapping another square opens its forecast; the link keeps only the square's
 * center, never the point tapped.
 */
export function AdjustOnMap({ input }: { input: ForecastInput }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  // The map stays centred where it opened while the forecast below it changes.
  const [origin] = useState(() => ({ lat: input.lat, lon: input.lon }));
  const cell = cellFor(input.lat, input.lon);

  function pick(next: WeatherCell) {
    if (next.id === cell.id) return;
    const ref = new URLSearchParams(window.location.search).get("ref");
    startTransition(() => router.push(forecastHref({ ...input, lat: next.lat, lon: next.lon }, { ref }), { scroll: false }));
  }

  if (!open) {
    return (
      <p className="text-sm">
        Wrong area?{" "}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex min-h-11 items-center font-semibold text-lagoon underline-offset-2 hover:underline"
        >
          Adjust on the map
        </button>
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted" aria-live="polite">
        {pending ? "Loading the forecast for that square…" : "Tap the square your pool is in. Each square is about 3 km (2 miles) across."}
      </p>
      <CellMap center={origin} cell={cell} onPick={pick} />
      <p className="text-xs text-muted">Map images from the OpenStreetMap Foundation; Tuffo keeps only the square&apos;s center in the link.</p>
    </div>
  );
}
