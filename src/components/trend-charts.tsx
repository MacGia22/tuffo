"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { innerTicks, ticks } from "@/lib/chart-scale";
import type { TrendData } from "@/lib/trends";

/**
 * Free chlorine, pH, peak UV and rain as four small multiples on one date axis:
 * one scale per panel (never two on one plot), a shared crosshair and tooltip, and
 * a table view underneath. With a 7-day plan, the days ahead are shaded and the free
 * chlorine the plan expects is drawn as a wide translucent line on the same scale, over forecast weather. Marks follow the dataviz specs: 2px lines, 8px markers
 * with a surface ring, thin columns with rounded tops, hairline grid.
 */

const LEFT = 40;
const RIGHT = 40;
const TITLE = 30;
const GAP = 14;
const AXIS = 24;
const HEIGHTS = { fc: 120, ph: 84, uv: 56, rain: 56 } as const;
type PanelKey = keyof typeof HEIGHTS;
const ORDER: PanelKey[] = ["fc", "ph", "uv", "rain"];

const TITLES: Record<PanelKey, string> = {
  fc: "Free chlorine (ppm)",
  ph: "pH",
  uv: "Peak UV index",
  rain: "Rain",
};

function columnPath(x: number, top: number, width: number, bottom: number): string {
  const h = bottom - top;
  const r = Math.min(4, width / 2, h);
  return `M${x},${bottom}V${top + r}A${r},${r} 0 0 1 ${x + r},${top}H${x + width - r}A${r},${r} 0 0 1 ${x + width},${top + r}V${bottom}Z`;
}

function fmt(value: number, decimals: number): string {
  return value.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** pH as tested: one decimal, two when the tester gave two. */
function fmtPh(value: number): string {
  return value.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 2 });
}

function tickLabel(key: PanelKey, value: number): string {
  if (key === "ph") return fmt(value, 1);
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => setWidth(Math.round(entries[0].contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

export function TrendCharts({
  data,
  rainHref = null,
}: {
  data: TrendData;
  /** The pool's rain page; with it, a picked past day offers "Set rain at your pool". */
  rainHref?: string | null;
}) {
  const { ref, width } = useWidth<HTMLDivElement>();
  const [active, setActiveState] = useState<number | null>(null);
  // The last past day read on the chart; stays after the pointer leaves, for the rain link.
  const [picked, setPicked] = useState<number | null>(null);
  const setActive = (i: number | null) => {
    setActiveState(i);
    if (i !== null && data.days[i] && !data.days[i].forecast) setPicked(i);
  };
  const [pointerY, setPointerY] = useState(0);
  const titleId = useId();
  const n = data.days.length;
  const us = data.units === "us";
  const rainValue = (mm: number) => (us ? mm / 25.4 : mm);
  const rainUnit = us ? "in" : "mm";
  const rainDecimals = us ? 2 : 1;
  const bandText = (key: "fc" | "ph") => {
    const band = key === "fc" ? data.fcBand : data.phBand;
    const f = (v: number) =>
      key === "ph" ? fmt(v, 1) : v.toLocaleString("en-US", { maximumFractionDigits: 1 });
    return `${f(band.low)}–${f(band.high)}`;
  };

  // Weather panels only once there is weather to show; empty panels read as "no rain".
  const panels: PanelKey[] = data.hasWeather ? ORDER : ["fc", "ph"];
  const tops: Record<PanelKey, number> = { fc: 0, ph: 0, uv: 0, rain: 0 };
  let y = 0;
  for (const key of panels) {
    tops[key] = y + TITLE;
    y += TITLE + HEIGHTS[key] + GAP;
  }
  const height = y - GAP + AXIS;
  const lastPanel = panels[panels.length - 1];
  const plotBottom = tops[lastPanel] + HEIGHTS[lastPanel];

  const w = width ?? 0;
  const plot = Math.max(1, w - LEFT - RIGHT);
  const day = plot / n;
  const xAt = (x: number) => LEFT + x * day;
  const center = (i: number) => LEFT + (i + 0.5) * day;

  // Scales, one per panel.
  // Free chlorine is scaled to the tests and the target band; estimates, the plan and
  // expectations beyond it are clamped to the edge and marked with an arrow.
  const fcValues = data.points.flatMap((p) => (p.fc === null ? [] : [p.fc]));
  const phValues = data.points.flatMap((p) => (p.ph === null ? [] : [p.ph]));
  const uvValues = data.days.flatMap((d) => (d.uv === null ? [] : [d.uv]));
  const rainValues = data.days.flatMap((d) => (d.rainMm === null ? [] : [rainValue(d.rainMm)]));
  const fcLowest = Math.min(data.fcBand.low, ...fcValues);
  const fcTicks = ticks(fcLowest < 3 ? 0 : Math.floor(fcLowest - 1), Math.max(data.fcBand.high * 1.15, ...fcValues.map((v) => v * 1.1)), 3);
  const phMin = Math.min(7, ...phValues.map((v) => v - 0.1));
  const phMax = Math.max(8, ...phValues.map((v) => v + 0.1));
  const phTicks = ticks(phMin, phMax, 3);
  // The small weather panels follow the data; their gridlines are the round values inside.
  const uvTop = Math.max(10, ...uvValues);
  const rainTop = Math.max(us ? 0.5 : 10, ...rainValues);
  const uvTicks = innerTicks(0, uvTop, 2);
  const rainTicks = innerTicks(0, rainTop, 2);
  const domain: Record<PanelKey, [number, number]> = {
    fc: [fcTicks[0], fcTicks[fcTicks.length - 1]],
    ph: [phTicks[0], phTicks[phTicks.length - 1]],
    uv: [0, uvTop],
    rain: [0, rainTop],
  };
  const yAt = (key: PanelKey, v: number) => {
    const [lo, hi] = domain[key];
    return tops[key] + HEIGHTS[key] - ((v - lo) / (hi - lo || 1)) * HEIGHTS[key];
  };
  const tickSets: Record<PanelKey, number[]> = { fc: fcTicks, ph: phTicks, uv: uvTicks, rain: rainTicks };
  const fcClamp = (v: number) => Math.min(domain.fc[1], Math.max(domain.fc[0], v));
  const yFc = (v: number) => yAt("fc", fcClamp(v));
  // One chevron per run of points beyond the scale, where the run leaves it, labelled
  // with the run's furthest value.
  const offScale: { x: number; value: number; up: boolean }[] = [];
  for (const series of [data.estimate, data.forecast, data.expected.map((e) => ({ x: e.x, fc: e.expected }))]) {
    let run: { x: number; value: number; up: boolean } | null = null;
    for (const p of series) {
      const up = p.fc > domain.fc[1];
      const down = p.fc < domain.fc[0];
      if (!up && !down) {
        if (run) offScale.push(run);
        run = null;
        continue;
      }
      if (run && run.up === up) {
        if (up ? p.fc > run.value : p.fc < run.value) run = { x: run.x, value: p.fc, up };
      } else {
        if (run) offScale.push(run);
        run = { x: p.x, value: p.fc, up };
      }
    }
    if (run) offScale.push(run);
  }

  const labelEvery = Math.max(1, Math.ceil(46 / Math.max(day, 1)));
  const colWidth = Math.max(2, Math.min(12, day - 4));

  function pick(clientX: number, clientY: number, target: HTMLElement) {
    if (!n) return;
    const rect = target.getBoundingClientRect();
    const i = Math.floor((clientX - rect.left - LEFT) / day);
    setActive(Math.min(n - 1, Math.max(0, i)));
    setPointerY(clientY - rect.top);
  }

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    const current = active ?? n - 1;
    if (e.key === "ArrowLeft") setActive(Math.max(0, current - 1));
    else if (e.key === "ArrowRight") setActive(Math.min(n - 1, current + 1));
    else if (e.key === "Home") setActive(0);
    else if (e.key === "End") setActive(n - 1);
    else if (e.key === "Escape") setActive(null);
    else return;
    e.preventDefault();
    setPointerY(tops.ph);
  }

  const forecastPath =
    data.forecast.length > 1
      ? data.forecast.map((p, i) => `${i ? "L" : "M"}${xAt(p.x).toFixed(1)},${yFc(p.fc).toFixed(1)}`).join("")
      : null;

  const estimatePath =
    data.estimate.length > 1
      ? data.estimate.map((p, i) => `${i ? "L" : "M"}${xAt(p.x).toFixed(1)},${yFc(p.fc).toFixed(1)}`).join("")
      : null;

  function lineFor(key: "fc" | "ph") {
    const pts = data.points.filter((p) => p[key] !== null);
    if (pts.length < 2) return null;
    return pts.map((p, i) => `${i ? "L" : "M"}${xAt(p.x).toFixed(1)},${yAt(key, p[key] as number).toFixed(1)}`).join("");
  }

  const activeDay = active === null ? null : data.days[active];
  const pickedDay = picked === null ? null : (data.days[picked] ?? null);
  const activePoints = active === null ? [] : data.points.filter((p) => Math.floor(p.x) === active);
  const activeDoses = active === null ? [] : data.doses.filter((d) => Math.floor(d.x) === active);
  const activeExpected = active === null ? [] : data.expected.filter((e) => Math.floor(e.x) === active);
  // After the last test: the estimate at the end of the active day (or now).
  const activeEstimate =
    active === null || activePoints.length
      ? null
      : ([...data.estimate].reverse().find((p) => p.x <= active + 1 && p.x >= active) ?? null);
  // Beside the crosshair when there is room; on narrow screens, pinned to the half of
  // the chart away from the finger so it never covers the point being read.
  const TIP = Math.min(240, w);
  let tipStyle: CSSProperties = {};
  if (active !== null) {
    const cx = center(active);
    if (w < 2 * TIP + 60) {
      const left = Math.min(Math.max(0, cx - TIP / 2), Math.max(0, w - TIP));
      tipStyle = pointerY < height / 2 ? { left, bottom: 0, width: TIP } : { left, top: 0, width: TIP };
    } else {
      const left = cx + 14 + TIP > w ? Math.max(0, cx - 14 - TIP) : cx + 14;
      tipStyle = { left, width: TIP, top: Math.min(Math.max(0, pointerY - 40), Math.max(0, height - 170)) };
    }
  }
  const timeOf = (when: string) => when.split(", ").pop() ?? when;
  const singleTest = activePoints.length === 1 ? timeOf(activePoints[0].when) : null;

  const latest = (key: "fc" | "ph") => [...data.points].reverse().find((p) => p[key] !== null);

  return (
    <figure className="flex flex-col gap-3">
      <figcaption id={titleId} className="sr-only">
        Free chlorine and pH at each test
        {data.hasWeather ? ", with the peak UV index and rain for each day," : ""} over the last days
        {data.forecastFrom !== null ? ", and the free chlorine the 7-day plan expects for the days ahead" : ""}. Use the
        left and right arrow keys to read each day.
      </figcaption>
      <div
        ref={ref}
        role="group"
        aria-labelledby={titleId}
        tabIndex={0}
        onKeyDown={onKey}
        onFocus={() => setActive(active ?? n - 1)}
        onBlur={() => setActive(null)}
        onPointerMove={(e: PointerEvent<HTMLDivElement>) => pick(e.clientX, e.clientY, e.currentTarget)}
        onPointerDown={(e: PointerEvent<HTMLDivElement>) => pick(e.clientX, e.clientY, e.currentTarget)}
        onPointerLeave={(e: PointerEvent<HTMLDivElement>) => {
          // A lifted finger also "leaves"; keep the tapped day on touch screens.
          if (e.pointerType === "mouse") setActive(null);
        }}
        className="relative w-full touch-pan-y rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-lagoon/40"
        style={{ height }}
      >
        {width ? (
          <svg width={w} height={height} className="block overflow-visible" aria-hidden="true">
            {panels.map((key) => (
              <g key={key}>
                <text x={0} y={tops[key] - 14} className="fill-foreground text-[12px] font-semibold">
                  {key === "rain" ? `${TITLES.rain} (${rainUnit})` : TITLES[key]}
                  {key === "fc" || key === "ph" ? (
                    <tspan className="fill-muted font-normal">
                      {" "}
                      · target {bandText(key)}
                    </tspan>
                  ) : null}
                </text>
                {tickSets[key].map((t) => (
                  <g key={t}>
                    <line
                      x1={LEFT}
                      x2={LEFT + plot}
                      y1={yAt(key, t)}
                      y2={yAt(key, t)}
                      className={t === domain[key][0] ? "stroke-chart-axis" : "stroke-chart-grid"}
                      strokeWidth={1}
                      shapeRendering="crispEdges"
                    />
                    <text
                      x={LEFT - 6}
                      y={yAt(key, t) + 3.5}
                      textAnchor="end"
                      className="fill-muted text-[11px] tabular-nums"
                    >
                      {tickLabel(key, t)}
                    </text>
                  </g>
                ))}
              </g>
            ))}

            {/* Days ahead: shaded across every panel, labelled once */}
            {data.forecastFrom !== null ? (
              <g>
                <rect
                  x={xAt(data.forecastFrom)}
                  y={tops.fc}
                  width={Math.max(0, LEFT + plot - xAt(data.forecastFrom))}
                  height={plotBottom - tops.fc}
                  className="fill-chart-grid"
                  fillOpacity={0.35}
                />
                <text x={LEFT + plot} y={tops.fc - 14} textAnchor="end" className="fill-muted text-[11px]">
                  Forecast →
                </text>
              </g>
            ) : null}

            {/* Target bands */}
            {(["fc", "ph"] as const).map((key) => {
              const band = key === "fc" ? data.fcBand : data.phBand;
              const top = yAt(key, Math.min(band.high, domain[key][1]));
              const bottom = yAt(key, Math.max(band.low, domain[key][0]));
              return (
                <rect
                  key={`band-${key}`}
                  x={LEFT}
                  y={top}
                  width={plot}
                  height={Math.max(0, bottom - top)}
                  className="fill-chart-chem"
                  fillOpacity={0.1}
                />
              );
            })}

            {/* Weather columns */}
            {data.hasWeather && data.days.map((d, i) =>
              d.uv !== null && d.uv > 0 ? (
                <path
                  key={`uv-${d.date}`}
                  d={columnPath(center(i) - colWidth / 2, yAt("uv", d.uv), colWidth, yAt("uv", 0))}
                  className="fill-chart-uv"
                  fillOpacity={d.forecast ? 0.5 : 1}
                />
              ) : null,
            )}
            {data.hasWeather && data.days.map((d, i) =>
              d.rainMm !== null && d.rainMm > 0.05 ? (
                <path
                  key={`rain-${d.date}`}
                  d={columnPath(center(i) - colWidth / 2, yAt("rain", rainValue(d.rainMm)), colWidth, yAt("rain", 0))}
                  className="fill-chart-rain"
                  fillOpacity={d.forecast ? 0.5 : 1}
                />
              ) : null,
            )}

            {/* Chemistry lines and markers */}
            {(["fc", "ph"] as const).map((key) => {
              const d = lineFor(key);
              return d ? (
                <path
                  key={`line-${key}`}
                  d={d}
                  fill="none"
                  className="stroke-chart-chem"
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ) : null;
            })}
            {estimatePath ? (
              <path
                d={estimatePath}
                fill="none"
                className="stroke-chart-chem"
                strokeOpacity={0.55}
                strokeWidth={2}
                strokeDasharray="1 5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}
            {data.expected.map((e) => (
              <line
                key={`gap-${e.x}`}
                x1={xAt(e.x)}
                x2={xAt(e.x)}
                y1={yFc(e.expected)}
                y2={yFc(e.measured)}
                className="stroke-chart-chem"
                strokeOpacity={0.35}
                strokeWidth={1}
                strokeDasharray="2 2"
              />
            ))}
            {data.expected.map((e) => (
              <circle
                key={`exp-${e.x}`}
                cx={xAt(e.x)}
                cy={yFc(e.expected)}
                r={4}
                className="fill-surface stroke-chart-chem"
                strokeOpacity={0.7}
                strokeWidth={1.5}
              />
            ))}
            {forecastPath ? (
              <path
                d={forecastPath}
                fill="none"
                className="stroke-chart-chem"
                strokeOpacity={0.35}
                strokeWidth={5}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ) : null}
            {offScale.map((o) => {
              const x = xAt(o.x);
              const y = o.up ? tops.fc + 1 : tops.fc + HEIGHTS.fc - 1;
              return (
                <path
                  key={`off-${o.x}-${o.up}`}
                  d={o.up ? `M${x - 5},${y + 7}L${x},${y + 1}L${x + 5},${y + 7}` : `M${x - 5},${y - 7}L${x},${y - 1}L${x + 5},${y - 7}`}
                  fill="none"
                  className="stroke-chart-chem"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <title>{`Beyond the scale: up to about ${fmt(o.value, 1)} ppm`}</title>
                </path>
              );
            })}
            {(["fc", "ph"] as const).flatMap((key) =>
              data.points
                .filter((p) => p[key] !== null)
                .map((p) => (
                  <circle
                    key={`${key}-${p.x}`}
                    cx={xAt(p.x)}
                    cy={yAt(key, p[key] as number)}
                    r={4}
                    className="fill-chart-chem stroke-surface"
                    strokeWidth={2}
                  />
                )),
            )}
            {(["fc", "ph"] as const).map((key) => {
              const p = latest(key);
              if (!p) return null;
              const x = xAt(p.x);
              const label = key === "ph" ? fmtPh(p[key] as number) : fmt(p[key] as number, 1);
              const right = x + 8 + 26 <= w;
              return (
                <text
                  key={`end-${key}`}
                  x={right ? x + 8 : x - 8}
                  y={yAt(key, p[key] as number) - 7}
                  textAnchor={right ? "start" : "end"}
                  className="fill-foreground text-[11px] font-semibold"
                >
                  {label}
                </text>
              );
            })}

            {/* Doses: small markers hanging from the top edge of the chlorine panel (keyed below the chart) */}
            {data.doses.map((d, i) => {
              const x = xAt(d.x);
              const top = tops.fc;
              return <path key={`dose-${i}`} d={`M${x - 4},${top}H${x + 4}L${x},${top + 6}Z`} className="fill-muted" />;
            })}

            {/* Date axis */}
            {data.days.map((d, i) =>
              (n - 1 - i) % labelEvery === 0 ? (
                <text
                  key={`x-${d.date}`}
                  x={center(i)}
                  y={height - 6}
                  textAnchor="middle"
                  className="fill-muted text-[11px]"
                >
                  {d.label}
                </text>
              ) : null,
            )}

            {active !== null ? (
              <line
                x1={center(active)}
                x2={center(active)}
                y1={tops.fc}
                y2={plotBottom}
                className="stroke-muted"
                strokeWidth={1}
                shapeRendering="crispEdges"
              />
            ) : null}
          </svg>
        ) : null}

        {activeDay ? (
          <div
            className="pointer-events-none absolute z-10 rounded-xl border border-border bg-surface p-3 text-sm shadow-lg"
            style={tipStyle}
          >
            <p className="mb-2 text-xs font-semibold text-muted">
              {activeDay.label}
              {activeDay.forecast ? " · forecast" : ""}
              {singleTest ? ` · tested ${singleTest}` : ""}
            </p>
            <ul className="flex flex-col gap-1">
              {activePoints
                .flatMap((p) => {
                  const at = singleTest ? "" : ` · ${timeOf(p.when)}`;
                  return [
                    ...(p.fc !== null ? [{ key: `fc${p.x}`, value: `${fmt(p.fc, 1)} ppm`, label: `Free chlorine${at}` }] : []),
                    ...activeExpected
                      .filter((e) => e.x === p.x)
                      .map((e) => ({ key: `ex${e.x}`, value: `≈${fmt(e.expected, 1)} ppm`, label: "Tuffo expected" })),
                    ...(p.ph !== null ? [{ key: `ph${p.x}`, value: fmtPh(p.ph), label: `pH${at}` }] : []),
                  ];
                })
                .map((row) => (
                  <li key={row.key} className="flex items-baseline gap-2">
                    <svg width="12" height="4" aria-hidden="true" className="shrink-0 self-center">
                      <line x1="0" x2="12" y1="2" y2="2" className="stroke-chart-chem" strokeWidth={2} strokeLinecap="round" />
                    </svg>
                    <span className="whitespace-nowrap font-semibold text-foreground tabular-nums">{row.value}</span>
                    <span className="text-muted">{row.label}</span>
                  </li>
                ))}
              {data.hasWeather ? (
                <>
                  <li className="flex items-baseline gap-2">
                    <svg width="12" height="4" aria-hidden="true" className="shrink-0 self-center">
                      <line x1="0" x2="12" y1="2" y2="2" className="stroke-chart-uv" strokeWidth={2} strokeLinecap="round" />
                    </svg>
                    <span className="whitespace-nowrap font-semibold text-foreground tabular-nums">
                      {activeDay.uv === null ? "—" : fmt(activeDay.uv, 1)}
                    </span>
                    <span className="text-muted">Peak UV</span>
                  </li>
                  <li className="flex items-baseline gap-2">
                    <svg width="12" height="4" aria-hidden="true" className="shrink-0 self-center">
                      <line x1="0" x2="12" y1="2" y2="2" className="stroke-chart-rain" strokeWidth={2} strokeLinecap="round" />
                    </svg>
                    <span className="whitespace-nowrap font-semibold text-foreground tabular-nums">
                      {activeDay.rainMm === null ? "—" : `${fmt(rainValue(activeDay.rainMm), rainDecimals)} ${rainUnit}`}
                    </span>
                    <span className="text-muted">{activeDay.ownRain ? "Rain at your pool" : "Rain"}</span>
                  </li>
                </>
              ) : null}
              {activeEstimate ? (
                <li className="flex items-baseline gap-2">
                  <svg width="12" height="4" aria-hidden="true" className="shrink-0 self-center">
                    <line
                      x1="1"
                      x2="11"
                      y1="2"
                      y2="2"
                      className="stroke-chart-chem"
                      strokeOpacity={0.55}
                      strokeWidth={2}
                      strokeDasharray="1 4"
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className="whitespace-nowrap font-semibold text-foreground tabular-nums">
                    ≈{fmt(activeEstimate.fc, 1)} ppm
                  </span>
                  <span className="text-muted">Free chlorine, estimated</span>
                </li>
              ) : null}
              {activeDoses.map((d, i) => (
                <li key={`d${i}`} className="text-muted">
                  <span className="font-semibold text-foreground">Added</span> {d.label}
                </li>
              ))}
              {activeDay.plan ? (
                <>
                  <li className="flex items-baseline gap-2">
                    <svg width="12" height="4" aria-hidden="true" className="shrink-0 self-center">
                      <line x1="1" x2="11" y1="2" y2="2" className="stroke-chart-chem" strokeOpacity={0.35} strokeWidth={4} strokeLinecap="round" />
                    </svg>
                    <span className="whitespace-nowrap font-semibold text-foreground tabular-nums">
                      ≈{fmt(activeDay.plan.fcEnd, 1)} ppm
                    </span>
                    <span className="text-muted">Free chlorine by evening, on the plan</span>
                  </li>
                  <li className="text-muted">
                    <span className="font-semibold text-foreground">Plan</span>{" "}
                    {activeDay.plan.add ? `add ${activeDay.plan.add}` : "nothing to add"}
                  </li>
                </>
              ) : null}
            </ul>
          </div>
        ) : null}
        <p className="sr-only" aria-live="polite">
          {activeDay
            ? [
                activeDay.label,
                ...activePoints.map((p) =>
                  [p.fc !== null ? `free chlorine ${fmt(p.fc, 1)} ppm` : "", p.ph !== null ? `pH ${fmtPh(p.ph)}` : ""]
                    .filter(Boolean)
                    .join(", "),
                ),
                activeDay.uv === null ? "" : `peak UV ${fmt(activeDay.uv, 1)}`,
                activeDay.rainMm === null
                  ? ""
                  : `${activeDay.ownRain ? "rain at your pool" : "rain"} ${fmt(rainValue(activeDay.rainMm), rainDecimals)} ${rainUnit}`,
                ...activeDoses.map((d) => `added ${d.label}`),
                activeDay.plan
                  ? `plan: ${activeDay.plan.add ? `add ${activeDay.plan.add}` : "nothing to add"}, free chlorine about ${fmt(activeDay.plan.fcEnd, 1)} ppm by evening`
                  : "",
                activeDay.forecast ? "forecast" : "",
              ]
                .filter(Boolean)
                .join("; ")
            : ""}
        </p>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <svg width="14" height="10" aria-hidden="true">
            <rect x="0" y="0" width="14" height="10" rx="2" className="fill-chart-chem" fillOpacity={0.1} />
          </svg>
          Target range
        </span>
        {data.estimate.length > 1 ? (
          <span className="inline-flex items-center gap-1.5">
            <svg width="16" height="4" aria-hidden="true">
              <line
                x1="1"
                x2="15"
                y1="2"
                y2="2"
                className="stroke-chart-chem"
                strokeOpacity={0.55}
                strokeWidth={2}
                strokeDasharray="1 4"
                strokeLinecap="round"
              />
            </svg>
            Estimated since your last test
          </span>
        ) : null}
        {data.expected.length ? (
          <span className="inline-flex items-center gap-1.5">
            <svg width="10" height="10" aria-hidden="true">
              <circle cx="5" cy="5" r="3.5" className="fill-surface stroke-chart-chem" strokeOpacity={0.7} strokeWidth={1.5} />
            </svg>
            What Tuffo expected at the test
          </span>
        ) : null}
        {data.forecast.length ? (
          <span className="inline-flex items-center gap-1.5">
            <svg width="16" height="4" aria-hidden="true">
              <line x1="2" x2="14" y1="2" y2="2" className="stroke-chart-chem" strokeOpacity={0.35} strokeWidth={4} strokeLinecap="round" />
            </svg>
            Free chlorine if you follow the plan
          </span>
        ) : null}
        {offScale.length ? (
          <span className="inline-flex items-center gap-1.5">
            <svg width="12" height="8" aria-hidden="true">
              <path d="M1,7L6,2L11,7" fill="none" className="stroke-chart-chem" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Beyond the scale (values in the table)
          </span>
        ) : null}
        {data.doses.length ? (
          <span className="inline-flex items-center gap-1.5">
            <svg width="10" height="8" aria-hidden="true">
              <path d="M1,1H9L5,7Z" className="fill-muted" />
            </svg>
            Chemical added
          </span>
        ) : null}
      </div>
      {!data.hasWeather ? (
        <p className="text-sm text-muted">UV and rain appear here once the weather for this pool has loaded.</p>
      ) : rainHref ? (
        <p className="text-sm text-muted">
          {pickedDay ? (
            <>
              Rain on {pickedDay.label}:{" "}
              <span className="font-semibold text-foreground tabular-nums">
                {pickedDay.rainMm === null ? "not known" : `${fmt(rainValue(pickedDay.rainMm), rainDecimals)} ${rainUnit}`}
              </span>{" "}
              {pickedDay.ownRain ? "at your pool" : "for your area"}.{" "}
              <Link href={`${rainHref}?date=${pickedDay.date}`} className="font-semibold text-lagoon underline-offset-2 hover:underline">
                {pickedDay.ownRain ? "Change" : "Set rain at your pool"}
              </Link>
            </>
          ) : (
            "Rain is for your area. Tap a day to set what fell at your pool."
          )}
        </p>
      ) : null}
      <details className="text-sm">
        <summary className="cursor-pointer font-semibold text-lagoon">Show as a table</summary>
        <div className="mt-2 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="bg-surface text-left text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="px-3 py-2">Day</th>
                <th className="px-3 py-2 text-right">Free chlorine</th>
                <th className="px-3 py-2 text-right">pH</th>
                {data.hasWeather ? (
                  <>
                    <th className="px-3 py-2 text-right">Peak UV</th>
                    <th className="px-3 py-2 text-right">Rain ({rainUnit})</th>
                  </>
                ) : null}
                <th className="px-3 py-2">Added</th>
              </tr>
            </thead>
            <tbody>
              {[...data.days].reverse().map((d) => {
                const i = data.days.indexOf(d);
                const pts = data.points.filter((p) => Math.floor(p.x) === i);
                const doses = data.doses.filter((x) => Math.floor(x.x) === i);
                return (
                  <tr key={d.date} className="border-t border-border">
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      {d.label}
                      {d.forecast ? <span className="text-muted"> (forecast)</span> : null}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {[
                        ...pts
                          .filter((p) => p.fc !== null)
                          .map((p) => {
                            const e = data.expected.find((x) => x.x === p.x);
                            return `${fmt(p.fc as number, 1)}${e ? ` (expected ≈${fmt(e.expected, 1)})` : ""}`;
                          }),
                        ...(d.plan ? [`≈${fmt(d.plan.fcEnd, 1)} by evening`] : []),
                      ].join(" / ") || "—"}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {pts.filter((p) => p.ph !== null).map((p) => fmtPh(p.ph as number)).join(" / ") || "—"}
                    </td>
                    {data.hasWeather ? (
                      <>
                        <td className="px-3 py-1.5 text-right tabular-nums">{d.uv === null ? "—" : fmt(d.uv, 1)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {d.rainMm === null ? "—" : fmt(rainValue(d.rainMm), rainDecimals)}
                          {d.ownRain ? <span className="text-muted"> (your pool)</span> : null}
                          {rainHref && !d.forecast ? (
                            <>
                              {" "}
                              <Link
                                href={`${rainHref}?date=${d.date}`}
                                className="font-semibold text-lagoon underline-offset-2 hover:underline"
                                aria-label={`Set rain at your pool on ${d.label}`}
                              >
                                Set
                              </Link>
                            </>
                          ) : null}
                        </td>
                      </>
                    ) : null}
                    <td className="px-3 py-1.5 text-muted">
                      {[
                        ...doses.map((x) => x.label),
                        ...(d.plan ? [`Plan: ${d.plan.add ? `add ${d.plan.add}` : "nothing to add"}`] : []),
                      ].join("; ")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
