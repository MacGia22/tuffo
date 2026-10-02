"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import type { Map as LeafletMap, LayerGroup, Rectangle } from "leaflet";
import { cellBounds, cellFor, cellNear, cellsInView, lonNear, wrapLon, type WeatherCell } from "@/lib/weather/cells";

/**
 * A map of the weather grid around the picked town: each square is one weather cell,
 * about 3 km (2 miles) across. Tapping a square picks it; only that square is sent to
 * the server, never the point tapped. Tiles come from OpenStreetMap (named in /privacy).
 */
export function CellMap({
  center,
  cell,
  onPick,
}: {
  /** The picked town; squares further than 0.3° from it cannot be picked. */
  center: { lat: number; lon: number };
  cell: WeatherCell;
  onPick: (cell: WeatherCell) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const selected = useRef<Rectangle | null>(null);
  const pick = useRef(onPick);
  const first = useRef(cell);
  const { lat, lon } = center;

  useEffect(() => {
    pick.current = onPick;
  }, [onPick]);

  useEffect(() => {
    const town = { lat, lon };
    // The brand color, read from the page's tokens (Leaflet draws with plain colors).
    const lagoon = getComputedStyle(document.documentElement).getPropertyValue("--color-lagoon").trim() || "#0e7c9e";
    let cancelled = false;
    let grid: LayerGroup | null = null;
    void import("leaflet").then((L) => {
      if (cancelled || !box.current) return;
      const m = L.map(box.current, {
        center: [first.current.lat, lonNear(first.current.lon, lon)],
        zoom: 12,
        minZoom: 10,
        maxZoom: 16,
        maxBounds: [
          [lat - 0.5, lon - 0.5],
          [lat + 0.5, lon + 0.5],
        ],
      });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(m);
      grid = L.layerGroup().addTo(m);
      const drawGrid = () => {
        grid?.clearLayers();
        const b = m.getBounds();
        const cells = cellsInView(b.getSouth(), b.getWest(), b.getNorth(), b.getEast());
        for (const c of cells ?? []) {
          if (!cellNear(c, town)) continue;
          L.rectangle(cellBounds(c, lon), { color: lagoon, weight: 1, opacity: 0.5, fill: false, interactive: false }).addTo(grid!);
        }
      };
      m.on("moveend", drawGrid);
      m.on("click", (e) => {
        const c = cellFor(e.latlng.lat, wrapLon(e.latlng.lng));
        if (cellNear(c, town)) pick.current(c);
      });
      selected.current = L.rectangle(cellBounds(first.current, lon), {
        color: lagoon,
        weight: 2,
        fillColor: lagoon,
        fillOpacity: 0.25,
        interactive: false,
      }).addTo(m);
      drawGrid();
      map.current = m;
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      selected.current = null;
    };
  }, [lat, lon]);

  useEffect(() => {
    selected.current?.setBounds(cellBounds(cell, lon));
    // Keep the picked square in view when it is moved with the buttons.
    map.current?.panInside([cell.lat, lonNear(cell.lon, lon)], { padding: [40, 40] });
  }, [cell, lon]);

  return (
    <div
      ref={box}
      role="application"
      aria-label="Map of weather squares. Tap the square your pool is in."
      className="h-72 w-full overflow-hidden rounded-xl border border-border"
    />
  );
}
