"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { DayCard } from "@/components/day-card";
import { ticks } from "@/lib/chart-scale";
import { chanceOnly, formatRainAmount, isDry } from "@/lib/format";
import { fcForDay, type TrendData, type TrendDay } from "@/lib/trends";
import { uvLevel, UV_LEVEL_LABEL, UV_LEVELS, type UvLevel } from "@/lib/uv";

/**
 * Free chlorine, pH, peak UV and rain on one column per day, shared by every row: one
 * scale per panel (never two on one plot), a readout above the chart for the selected
 * day (tap or click a column, or use the arrow keys), and a table view underneath.
 */

const LEFT = 34;
const RIGHT = 10;
const TITLE = 26;
const GAP = 14;
const FC_H = 170;
const PH_H = 80;
const UV_H = 24;
/** Rain: 1 in = 40 px (rescaled when a day had more), plus room for labels. */
const RAIN_PX_PER_IN = 40;
const RAIN_H = RAIN_PX_PER_IN + 16;
const AXIS_H = 46;
/** Below this column width the UV numbers and day numbers thin out. */
const NARROW = 15;

const UV_FILL: Record<UvLevel, { fill: string; text: string }> = {
  low: { fill: "var(--uv-low)", text: "var(--uv-low-fg)" },
  moderate: { fill: "var(--uv-moderate)", text: "var(--uv-moderate-fg)" },
  high: { fill: "var(--uv-high)", text: "var(--uv-high-fg)" },
  "very-high": { fill: "var(--uv-very-high)", text: "var(--uv-very-high-fg)" },
  extreme: { fill: "var(--uv-extreme)", text: "var(--uv-extreme-fg)" },
};

function f1(v: number): string {
  return v.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function fPh(v: number): string {
  return v.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 2 });
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

export function TrendChart({
  data,
  rainHref = null,
}: {
  data: TrendData;
  /** The pool's rain page; with it, a past day offers "Rain at my pool was different". */
  rainHref?: string | null;
}) {
  const { ref, width } = useWidth<HTMLDivElement>();
  const n = data.days.length;
  const [selected, setSelected] = useState(Math.min(Math.max(0, data.todayIndex), n - 1));
  const titleId = useId();
  const us = data.units === "us";
  const toRain = (mm: number) => (us ? mm / 25.4 : mm);
  const rainUnit = us ? "in" : "mm";
  const tempText = (c: number) => (us ? `${Math.round((c * 9) / 5 + 32)} °F` : `${Math.round(c)} °C`);

  // Rows, top to bottom.
  const showWeather = data.hasWeather;
  const top = { fc: TITLE, ph: 0, uv: 0, rain: 0, axis: 0 };
  let y = TITLE + FC_H + GAP + TITLE;
  top.ph = y;
  y += PH_H + GAP;
  if (showWeather) {
    top.uv = y + TITLE;
    y += TITLE + UV_H + GAP;
    top.rain = y + TITLE;
    y += TITLE + RAIN_H;
  }
  top.axis = y + 4;
  const height = top.axis + AXIS_H;

  const w = width ?? 0;
  const plot = Math.max(1, w - LEFT - RIGHT);
  const col = plot / Math.max(1, n);
  const xAt = (x: number) => LEFT + x * col;
  const center = (i: number) => LEFT + (i + 0.5) * col;

  // Free chlorine: 0 to a round tick above the target, the tests and the plan.
  const measured = data.points.flatMap((p) => (p.fc === null ? [] : [p.fc]));
  const planned = data.forecast.map((p) => p.fc);
  // Everything drawn on the panel fits: the estimate band and "what Tuffo expected" too.
  const estimated = data.estimate.map((p) => p.fc + p.spread);
  const expected = data.expected.map((e) => e.expected);
  const fcTicks = ticks(0, Math.max(data.fcBand.high, ...measured, ...planned, ...estimated, ...expected, data.fcMin ?? 0), 4);
  const fcTop = fcTicks[fcTicks.length - 1];
  const yFc = (v: number) => top.fc + FC_H - (Math.min(Math.max(v, 0), fcTop) / fcTop) * FC_H;

  const phValues = data.points.flatMap((p) => (p.ph === null ? [] : [p.ph]));
  const phTicks = ticks(Math.min(7, ...phValues.map((v) => v - 0.1)), Math.max(8, ...phValues.map((v) => v + 0.1)), 3);
  const phLo = phTicks[0];
  const phHi = phTicks[phTicks.length - 1];
  const yPh = (v: number) => top.ph + PH_H - ((v - phLo) / (phHi - phLo || 1)) * PH_H;

  // Rain: 1 in = 40 px, rescaled when the wettest day had more.
  const rainIn = data.days.map((d) => (d.rainMm === null ? 0 : d.rainMm / 25.4));
  const maxIn = Math.max(0, ...rainIn);
  const pxPerIn = maxIn > 1 ? RAIN_PX_PER_IN / maxIn : RAIN_PX_PER_IN;
  const rainBase = top.rain + RAIN_H;
  const wet = rainIn.map((v, i) => ({ v, i })).filter((d) => d.v >= 0.45);
  const labelled = new Set(
    (wet.length ? wet : rainIn.map((v, i) => ({ v, i })).filter((d) => d.v > 0.01).sort((a, b) => b.v - a.v).slice(0, 3)).map((d) => d.i),
  );

  const uvShown = UV_LEVELS.filter((l) => data.days.some((d) => d.uv !== null && uvLevel(d.uv) === l));
  const nowX = data.forecastFrom ?? data.todayIndex + 0.5;

  // The plan's peak when it leaves the target band.
  const peak = data.forecast.length ? data.forecast.reduce((a, b) => (b.fc > a.fc ? b : a)) : null;
  const peakLabel = peak && peak.fc > data.fcBand.high ? peak : null;

  // Estimate ribbon, from the test to now: ± its spread, at least 2 px either side after the
  // test so it reads as a band.
  const ppmPx = FC_H / fcTop;
  const half = (p: { spread: number }, k: number) => (k === 0 ? p.spread * ppmPx : Math.max(2, p.spread * ppmPx));
  const ribbon =
    data.estimate.length > 1
      ? [
          ...data.estimate.map((p, k) => `${xAt(p.x).toFixed(1)},${(yFc(p.fc) - half(p, k)).toFixed(1)}`),
          ...data.estimate
            .map((p, k) => `${xAt(p.x).toFixed(1)},${(yFc(p.fc) + half(p, k)).toFixed(1)}`)
            .reverse(),
        ].join(" ")
      : null;
  // The minimum line turns red only when the estimate or the plan comes within 1 ppm of it.
  const nearMin =
    data.fcMin !== null && [...data.estimate.map((p) => p.fc - p.spread), ...data.forecast.map((p) => p.fc)].some((v) => v - (data.fcMin as number) <= 1);
  const estimateLine =
    data.estimate.length > 1 ? data.estimate.map((p, i) => `${i ? "L" : "M"}${xAt(p.x).toFixed(1)},${yFc(p.fc).toFixed(1)}`).join("") : null;
  const planLine =
    data.forecast.length > 1 ? data.forecast.map((p, i) => `${i ? "L" : "M"}${xAt(p.x).toFixed(1)},${yFc(p.fc).toFixed(1)}`).join("") : null;

  // pH: a thin line between tests at most 10 days apart.
  const phPoints = data.points.filter((p) => p.ph !== null);
  const phSegments = phPoints.slice(1).flatMap((p, i) => {
    const a = phPoints[i];
    return p.x - a.x <= 10 ? [`M${xAt(a.x).toFixed(1)},${yPh(a.ph as number).toFixed(1)}L${xAt(p.x).toFixed(1)},${yPh(p.ph as number).toFixed(1)}`] : [];
  });

  // Value labels: the latest test, and any other with room before the next one.
  const fcPoints = data.points.filter((p) => p.fc !== null);
  const roomy = (pts: typeof fcPoints, k: number) => k === pts.length - 1 || (pts[k + 1].x - pts[k].x) * col >= 26;

  // Day axis: thin out the day numbers on narrow columns.
  const every = col >= NARROW ? 1 : Math.ceil(NARROW / Math.max(col, 1));
  const dayNum = (d: TrendDay) => String(Number(d.date.slice(8)));

  function pick(e: PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const i = Math.floor((e.clientX - rect.left - LEFT) / col);
    if (i >= 0 && i < n) setSelected(i);
  }

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowLeft") setSelected((s) => Math.max(0, s - 1));
    else if (e.key === "ArrowRight") setSelected((s) => Math.min(n - 1, s + 1));
    else if (e.key === "Home") setSelected(0);
    else if (e.key === "End") setSelected(n - 1);
    else return;
    e.preventDefault();
  }

  // The readout for the selected day.
  const day = data.days[selected];
  const tests = data.points.filter((p) => Math.floor(p.x) === selected);
  const marks = data.doses.filter((m) => Math.floor(m.x) === selected);
  const fc = fcForDay(data, selected);
  const ph = [...tests].reverse().find((p) => p.ph !== null)?.ph ?? null;
  const kind = tests.length ? "Your test" : day?.kind === "forecast" ? "Forecast" : day?.kind === "today" ? "Today" : "Past";
  const fcText = fc
    ? fc.kind === "measured"
      ? `${f1(fc.value)} measured`
      : fc.kind === "estimated"
        ? `≈ ${f1(fc.value)} estimated`
        : `≈ ${f1(fc.value)} on the plan`
    : null;
  const rainText =
    day?.rainMm === null || day?.rainMm === undefined
      ? null
      : isDry(day.rainMm, day.rainChance)
        ? "dry"
        : chanceOnly(day.rainMm, day.rainChance)
          ? `${Math.round(day.rainChance!)}% chance`
          : `${formatRainAmount(day.rainMm, data.units)}${day.rainChance !== null ? ` · ${Math.round(day.rainChance)}% chance` : ""}${day.ownRain ? " at your pool" : ""}`;

  return (
    <figure className="flex flex-col gap-3">
      <figcaption id={titleId} className="sr-only">
        Free chlorine and pH at each test, the estimate since the last test and the plan ahead, with peak UV and rain for
        each day. Use the left and right arrow keys to choose a day; its numbers are read above the chart.
      </figcaption>

      {day ? (
        <div aria-live="polite" className="sticky top-2 z-10 rounded-2xl bg-surface shadow-sm">
          <DayCard
            as="div"
            day={day.weekday}
            dateText={`${day.label} · ${kind}`}
            today={day.kind === "today"}
            ahead={day.kind === "forecast"}
            actions={[
              ...marks.map((m) => `▼ ${m.label}`),
              ...(day.plan?.add && day.kind !== "past" ? [`On the plan: add ${day.plan.add}`] : []),
            ]}
            fc={fcText ?? "no test"}
            fcLabel="Free chlorine"
            uv={day.uv}
            rain={rainText ? rainText.charAt(0).toUpperCase() + rainText.slice(1) : null}
            className="min-h-[6.5rem]"
          >
            {ph !== null || day.tmaxC !== null ? (
              <p className="text-xs text-muted">
                {[ph !== null ? `pH ${fPh(ph)}` : null, day.tmaxC !== null ? `High ${tempText(day.tmaxC)}` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            ) : null}
            {rainHref && day.kind !== "forecast" ? (
              <Link
                href={`${rainHref}?date=${day.date}`}
                className="inline-flex min-h-11 items-center self-start font-semibold text-lagoon underline-offset-2 hover:underline"
              >
                Rain at my pool was different
              </Link>
            ) : null}
          </DayCard>
        </div>
      ) : null}

      <div
        ref={ref}
        role="group"
        aria-labelledby={titleId}
        tabIndex={0}
        onKeyDown={onKey}
        onPointerDown={(e) => {
          // Tap or drag across the plot: the same selection as the arrow keys.
          e.currentTarget.setPointerCapture?.(e.pointerId);
          pick(e);
        }}
        onPointerMove={(e) => {
          if (e.buttons === 0 && e.pointerType === "mouse") return;
          if (e.currentTarget.hasPointerCapture?.(e.pointerId)) pick(e);
        }}
        className="relative w-full cursor-pointer touch-pan-y select-none rounded-xl"
        style={{ height }}
      >
        {width ? (
          <svg width={w} height={height} className="block overflow-visible" aria-hidden="true">
            {/* Selected column, across every row */}
            <rect x={xAt(selected)} y={0} width={col} height={height} className="fill-lagoon" fillOpacity={0.08} rx={3} />

            {/* Days ahead: faint fill on the chlorine panel, labelled once */}
            {data.forecastFrom !== null ? (
              <g>
                <rect x={xAt(nowX)} y={top.fc} width={Math.max(0, LEFT + plot - xAt(nowX))} height={FC_H} className="fill-chart-grid" fillOpacity={0.45} />
                <text x={LEFT + plot} y={top.fc - 10} textAnchor="end" className="fill-muted text-xs">
                  Forecast →
                </text>
              </g>
            ) : null}

            {/* Panel titles */}
            <text x={0} y={top.fc - 10} className="fill-foreground text-[12px] font-semibold">
              Free chlorine (ppm)
            </text>
            <text x={0} y={top.ph - 10} className="fill-foreground text-[12px] font-semibold">
              pH
            </text>
            {showWeather ? (
              <>
                <text x={0} y={top.uv - 10} className="fill-foreground text-[12px] font-semibold">
                  Peak UV
                </text>
                <text x={0} y={top.rain - 10} className="fill-foreground text-[12px] font-semibold">
                  Rain ({rainUnit})
                </text>
              </>
            ) : null}

            {/* Free chlorine grid */}
            {fcTicks.map((t) => (
              <g key={`fct-${t}`}>
                <line x1={LEFT} x2={LEFT + plot} y1={yFc(t)} y2={yFc(t)} className={t === 0 ? "stroke-chart-axis" : "stroke-chart-grid"} shapeRendering="crispEdges" />
                <text x={LEFT - 6} y={yFc(t) + 3.5} textAnchor="end" className="fill-muted text-xs tabular-nums">
                  {t}
                </text>
              </g>
            ))}
            {/* Target band with its label */}
            <rect
              x={LEFT}
              y={yFc(data.fcBand.high)}
              width={plot}
              height={Math.max(0, yFc(data.fcBand.low) - yFc(data.fcBand.high))}
              className="fill-chart-chem"
              fillOpacity={0.12}
            />
            <text x={LEFT + plot - 4} y={yFc(data.fcBand.high) + 12} textAnchor="end" className="fill-muted text-xs">
              Target {data.fcBand.low}–{data.fcBand.high}
            </text>
            {data.fcMin !== null ? (
              <g>
                <line
                  x1={LEFT}
                  x2={LEFT + plot}
                  y1={yFc(data.fcMin)}
                  y2={yFc(data.fcMin)}
                  className={nearMin ? "stroke-status-critical" : "stroke-muted"}
                  strokeWidth={1}
                  strokeDasharray="4 3"
                  shapeRendering="crispEdges"
                />
                <text x={LEFT + plot - 4} y={yFc(data.fcMin) + 13} textAnchor="end" className={`text-xs ${nearMin ? "fill-status-critical font-semibold" : "fill-muted"}`}>
                  Never below {data.fcMin}
                </text>
              </g>
            ) : null}

            {/* Estimate since the test */}
            {ribbon ? <polygon points={ribbon} className="fill-chart-chem" fillOpacity={0.22} /> : null}
            {estimateLine ? <path d={estimateLine} fill="none" className="stroke-chart-chem" strokeOpacity={0.6} strokeWidth={1} /> : null}
            {/* The plan: one solid line */}
            {planLine ? <path d={planLine} fill="none" className="stroke-chart-chem" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" /> : null}
            {peakLabel ? (
              <text x={xAt(peakLabel.x)} y={yFc(peakLabel.fc) - 8} textAnchor="middle" className="fill-foreground text-xs font-semibold">
                ≈ {f1(peakLabel.fc)}
              </text>
            ) : null}
            {/* What Tuffo expected at each test (shown once the pool has its own model) */}
            {data.expected.map((e) => (
              <circle key={`exp-${e.x}`} cx={xAt(e.x)} cy={yFc(e.expected)} r={4} className="fill-surface stroke-chart-chem" strokeOpacity={0.7} strokeWidth={1.5} />
            ))}
            {/* Tests */}
            {fcPoints.map((p, k) => (
              <g key={`fc-${p.x}`}>
                <circle cx={xAt(p.x)} cy={yFc(p.fc as number)} r={4.5} className="fill-chart-chem stroke-surface" strokeWidth={2} />
                {roomy(fcPoints, k) ? (
                  <text x={xAt(p.x)} y={yFc(p.fc as number) - 9} textAnchor="middle" className="fill-foreground text-xs font-semibold tabular-nums">
                    {f1(p.fc as number)}
                  </text>
                ) : null}
              </g>
            ))}
            {/* Doses and events along the bottom */}
            {data.doses.map((m, k) => {
              const x = xAt(m.x);
              const b = top.fc + FC_H;
              return <path key={`m-${k}`} d={`M${x - 4.5},${b - 9}H${x + 4.5}L${x},${b - 2}Z`} className="fill-muted" />;
            })}

            {/* pH */}
            {phTicks.map((t) => (
              <g key={`pht-${t}`}>
                <line x1={LEFT} x2={LEFT + plot} y1={yPh(t)} y2={yPh(t)} className={t === phLo ? "stroke-chart-axis" : "stroke-chart-grid"} shapeRendering="crispEdges" />
                <text x={LEFT - 6} y={yPh(t) + 3.5} textAnchor="end" className="fill-muted text-xs tabular-nums">
                  {t.toFixed(1)}
                </text>
              </g>
            ))}
            <rect
              x={LEFT}
              y={yPh(data.phBand.high)}
              width={plot}
              height={Math.max(0, yPh(data.phBand.low) - yPh(data.phBand.high))}
              className="fill-chart-chem"
              fillOpacity={0.12}
            />
            {phSegments.map((d, k) => (
              <path key={`phl-${k}`} d={d} fill="none" className="stroke-chart-chem" strokeWidth={1} strokeOpacity={0.7} />
            ))}
            {phPoints.map((p, k) => (
              <g key={`ph-${p.x}`}>
                <circle cx={xAt(p.x)} cy={yPh(p.ph as number)} r={4} className="fill-chart-chem stroke-surface" strokeWidth={2} />
                {roomy(phPoints, k) ? (
                  <text x={xAt(p.x)} y={yPh(p.ph as number) - 8} textAnchor="middle" className="fill-foreground text-xs font-semibold tabular-nums">
                    {fPh(p.ph as number)}
                  </text>
                ) : null}
              </g>
            ))}

            {/* UV: one rounded cell per day in its level's colour */}
            {showWeather
              ? data.days.map((d, i) => {
                  if (d.uv === null) return null;
                  const level = uvLevel(d.uv);
                  const c = UV_FILL[level];
                  // Days ahead keep their full fill (the colour still reads) with a dashed edge.
                  const ahead = d.kind !== "past";
                  return (
                    <g key={`uv-${d.date}`}>
                      <rect
                        x={xAt(i) + 1.5}
                        y={top.uv + 0.5}
                        width={Math.max(1, col - 3)}
                        height={UV_H - 1}
                        rx={Math.min(6, col / 3)}
                        fill={c.fill}
                        stroke={ahead ? "var(--muted)" : "var(--uv-border)"}
                        strokeWidth={1}
                        strokeDasharray={ahead ? "3 2" : undefined}
                      />
                      {col >= NARROW ? (
                        <text x={center(i)} y={top.uv + UV_H / 2 + 4} textAnchor="middle" fill={c.text} className="text-xs font-semibold tabular-nums">
                          {Math.round(d.uv)}
                        </text>
                      ) : null}
                    </g>
                  );
                })
              : null}

            {/* Rain: bars on a baseline; days ahead as an outline */}
            {showWeather ? (
              <g>
                <line x1={LEFT} x2={LEFT + plot} y1={rainBase} y2={rainBase} className="stroke-chart-axis" shapeRendering="crispEdges" />
                {data.days.map((d, i) => {
                  const inches = rainIn[i];
                  if (!(inches > 0.005)) return null;
                  const h = Math.max(1.5, inches * pxPerIn);
                  // About 60% of the column on wider screens, narrower on phones.
                  const bw = Math.max(2, col * (w >= 640 ? 0.6 : 0.45));
                  // Today's rain is still a forecast until the day ends.
                  const ahead = d.kind !== "past";
                  const value = toRain(d.rainMm as number);
                  return (
                    <g key={`rain-${d.date}`}>
                      <rect
                        x={center(i) - bw / 2}
                        y={rainBase - h}
                        width={bw}
                        height={h}
                        rx={Math.min(2, bw / 3)}
                        className="fill-chart-rain stroke-chart-rain"
                        fillOpacity={ahead ? 0.3 : 1}
                        strokeWidth={ahead ? 1 : 0}
                      />
                      {labelled.has(i) && col >= 10 ? (
                        <text x={center(i)} y={rainBase - h - 3} textAnchor="middle" className="fill-foreground text-xs font-semibold tabular-nums">
                          {us ? value.toFixed(value >= 1 ? 1 : 2) : value.toFixed(value < 1 ? 1 : 0)}
                        </text>
                      ) : null}
                    </g>
                  );
                })}
              </g>
            ) : null}

            {/* Today */}
            {/* Through the chlorine and pH panels only; the column tint marks today below. */}
            <line x1={xAt(nowX)} x2={xAt(nowX)} y1={top.fc} y2={top.ph + PH_H} className="stroke-foreground" strokeOpacity={0.55} strokeWidth={1} />
            <text x={xAt(nowX)} y={top.fc - 10} textAnchor="middle" className="fill-foreground text-xs font-semibold">
              Today
            </text>

            {/* Day axis: date and weekday initial per column, the month at its first day */}
            {data.days.map((d, i) => {
              const isToday = i === data.todayIndex;
              const monthStart = d.date.endsWith("-01") || i === 0;
              const show = isToday || (n - 1 - i) % every === 0;
              return (
                <g key={`ax-${d.date}`} className={isToday ? "font-bold" : ""}>
                  {show ? (
                    <>
                      <text x={center(i)} y={top.axis + 12} textAnchor="middle" className={`text-xs tabular-nums ${isToday ? "fill-foreground" : "fill-muted"}`}>
                        {dayNum(d)}
                      </text>
                      {every === 1 ? (
                        <text x={center(i)} y={top.axis + 25} textAnchor="middle" className={`text-xs ${isToday ? "fill-foreground" : "fill-muted"}`}>
                          {d.weekday[0]}
                        </text>
                      ) : null}
                    </>
                  ) : null}
                  {monthStart ? (
                    <text x={xAt(i) + 1} y={top.axis + 40} className="fill-foreground text-xs font-semibold">
                      {d.label.split(" ")[0]}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </svg>
        ) : null}
      </div>

      {showWeather && uvShown.length ? (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-muted">UV</span>
          {uvShown.map((l) => (
            <span key={l} className="rounded-full px-2 py-0.5 font-semibold" style={{ background: UV_FILL[l].fill, color: UV_FILL[l].text }}>
              {UV_LEVEL_LABEL[l]}
            </span>
          ))}
          <span className="ml-2 inline-flex items-center gap-1.5 text-muted">
            <svg width="10" height="12" aria-hidden="true">
              <rect x="1" y="1" width="8" height="10" rx="1.5" className="fill-chart-rain stroke-chart-rain" fillOpacity={0.3} strokeWidth={1} />
            </svg>
            Rain forecast
          </span>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <svg width="10" height="10" aria-hidden="true">
            <circle cx="5" cy="5" r="4" className="fill-chart-chem" />
          </svg>
          Your test
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg width="18" height="10" aria-hidden="true">
            <path d="M1,4 L17,1 L17,9 L1,6Z" className="fill-chart-chem" fillOpacity={0.25} />
          </svg>
          Estimate since the test
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg width="18" height="6" aria-hidden="true">
            <line x1="1" x2="17" y1="3" y2="3" className="stroke-chart-chem" strokeWidth={2.5} strokeLinecap="round" />
          </svg>
          On the plan
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg width="16" height="10" aria-hidden="true">
            <rect width="16" height="10" rx="2" className="fill-chart-chem" fillOpacity={0.15} />
          </svg>
          Target
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg width="10" height="8" aria-hidden="true">
            <path d="M1,1H9L5,7Z" className="fill-muted" />
          </svg>
          Something added
        </span>
      </div>
      <p className="text-sm text-muted">
        Tap or drag across the days for their numbers.
        {showWeather ? " Rain is for your 2-mile area; correct it if your pool got more or less." : " UV and rain appear here once the weather for this pool has loaded."}
      </p>

      <details className="text-sm">
        <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-lagoon">Show as a table</summary>
        <div className="mt-2 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[600px] text-sm">
            <thead className="bg-surface text-left text-xs font-semibold text-muted">
              <tr>
                <th className="px-3 py-2">Day</th>
                <th className="px-3 py-2 text-right">Free chlorine (ppm)</th>
                <th className="px-3 py-2 text-right">pH</th>
                <th className="px-3 py-2 text-right">Peak UV</th>
                <th className="px-3 py-2 text-right">Rain ({rainUnit})</th>
                <th className="px-3 py-2 text-right">High</th>
                <th className="px-3 py-2">Added</th>
              </tr>
            </thead>
            <tbody>
              {data.days
                .map((d, i) => ({ d, i }))
                .reverse()
                .map(({ d, i }) => {
                  const f = fcForDay(data, i);
                  const p = data.points.filter((x) => Math.floor(x.x) === i && x.ph !== null);
                  const m = data.doses.filter((x) => Math.floor(x.x) === i);
                  return (
                    <tr key={d.date} className="border-t border-border">
                      <td className={`whitespace-nowrap px-3 py-1.5 ${i === data.todayIndex ? "font-semibold" : ""}`}>
                        {d.label}
                        {d.kind === "forecast" ? <span className="text-muted"> (forecast)</span> : d.kind === "today" ? <span className="text-muted"> (today)</span> : null}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {f ? (f.kind === "measured" ? f1(f.value) : `≈ ${f1(f.value)}${f.kind === "plan" ? " (plan)" : ""}`) : "—"}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{p.length ? fPh(p[p.length - 1].ph as number) : "—"}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{d.uv === null ? "—" : `${Math.round(d.uv)} · ${UV_LEVEL_LABEL[uvLevel(d.uv)]}`}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {d.rainMm === null ? "—" : formatRainAmount(d.rainMm, data.units).replace(/ (in|mm)$/, "")}
                        {d.rainChance !== null ? <span className="text-muted"> · {Math.round(d.rainChance)}%</span> : null}
                        {d.ownRain ? <span className="text-muted"> (your pool)</span> : null}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{d.tmaxC === null ? "—" : tempText(d.tmaxC)}</td>
                      <td className="px-3 py-1.5 text-muted">
                        {[...m.map((x) => x.label), ...(d.plan?.add && d.kind !== "past" ? [`Plan: add ${d.plan.add}`] : [])].join("; ")}
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
