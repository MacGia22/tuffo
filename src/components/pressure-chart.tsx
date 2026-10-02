"use client";

import { useEffect, useRef, useState } from "react";
import { innerTicks, pressureDomain } from "@/lib/chart-scale";
import { kpaToDisplayPressure, pressureUnitLabel, type Units } from "@/lib/format";

/** The container's width, null until measured: nothing is drawn at a guessed size. */
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

function short(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

const H = 170;
const PAD = { left: 40, right: 16, top: 12, bottom: 26 };

/**
 * Filter pressure over time on one scale, with the clean pressure and the clean-the-
 * filter line (clean + 8 psi / 0.55 bar). The axis starts 4 psi under clean, so the
 * rise fills the chart. Each reading is focusable with its value; the last is labelled.
 */
export function PressureChart({
  readings,
  cleanKpa,
  thresholdKpa,
  units,
}: {
  /** Oldest first. */
  readings: { readOn: string; kpa: number; clean: boolean }[];
  cleanKpa: number | null;
  thresholdKpa: number | null;
  units: Units;
}) {
  const { ref, width } = useWidth<HTMLDivElement>();
  if (readings.length === 0) return null;
  const W = Math.max(280, width ?? 0);
  const unit = pressureUnitLabel(units);
  const v = (kpa: number) => kpaToDisplayPressure(kpa, units);
  const values = readings.map((r) => v(r.kpa));
  const lines = [cleanKpa, thresholdKpa].filter((x): x is number => x !== null).map(v);
  const cleanValue = cleanKpa === null ? null : v(cleanKpa);
  const [yMin, yMax] = pressureDomain(values, cleanValue, lines, units === "us" ? 4 : 0.28);
  const yTicks = innerTicks(yMin, yMax, 4);
  const t = (d: string) => Date.parse(`${d}T12:00:00Z`);
  const t0 = t(readings[0].readOn);
  const t1 = Math.max(t(readings[readings.length - 1].readOn), t0 + 86_400_000);
  const x = (d: string) => PAD.left + ((t(d) - t0) / (t1 - t0)) * (W - PAD.left - PAD.right);
  const y = (val: number) => PAD.top + (1 - (val - yMin) / (yMax - yMin)) * (H - PAD.top - PAD.bottom);
  const fmt = (val: number) => (units === "us" ? `${Math.round(val)} ${unit}` : `${val.toFixed(2)} ${unit}`);
  const last = readings[readings.length - 1];
  const lastX = x(last.readOn);
  const path = readings.map((r, i) => `${i ? "L" : "M"}${x(r.readOn).toFixed(1)},${y(v(r.kpa)).toFixed(1)}`).join("");

  return (
    <figure className="flex flex-col gap-2">
      <div ref={ref} className="w-full max-w-2xl" style={{ minHeight: H }}>
      {width === null ? null : (
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block" role="img" aria-label={`Filter pressure, ${readings.length} readings, ${unit}`}>
        {yTicks.map((tick) => (
          <g key={tick}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} stroke="var(--chart-grid)" strokeWidth={1} />
            <text x={PAD.left - 6} y={y(tick) + 4} textAnchor="end" fontSize={12} fill="var(--muted)">
              {units === "us" ? Math.round(tick) : tick.toFixed(1)}
            </text>
          </g>
        ))}
        {cleanKpa !== null ? (
          <g>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v(cleanKpa))} y2={y(v(cleanKpa))} stroke="var(--muted)" strokeWidth={1.5} strokeDasharray="2 4" />
            <text x={PAD.left + 6} y={y(v(cleanKpa)) + 14} fontSize={12} fill="var(--muted)">
              Clean {fmt(v(cleanKpa))}
            </text>
          </g>
        ) : null}
        {thresholdKpa !== null ? (
          <g>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v(thresholdKpa))} y2={y(v(thresholdKpa))} stroke="var(--status-warning)" strokeWidth={2} strokeDasharray="8 5" />
            <text x={PAD.left + 6} y={y(v(thresholdKpa)) - 6} fontSize={12} fill="var(--foreground)">
              ⚠ Clean the filter at {fmt(v(thresholdKpa))}
            </text>
          </g>
        ) : null}
        <path d={path} fill="none" stroke="var(--chart-chem)" strokeWidth={2} strokeLinejoin="round" />
        {readings.map((r, i) => {
          const label = `${short(r.readOn)}: ${fmt(v(r.kpa))}${r.clean ? ", clean" : ""}`;
          return (
            <g key={`${r.readOn}-${i}`} tabIndex={0} aria-label={label} className="[&:focus>circle]:stroke-lagoon">
              <title>{label}</title>
              <circle cx={x(r.readOn)} cy={y(v(r.kpa))} r={10} fill="transparent" />
              <circle
                cx={x(r.readOn)}
                cy={y(v(r.kpa))}
                r={4.5}
                fill={r.clean ? "var(--surface)" : "var(--chart-chem)"}
                stroke={r.clean ? "var(--chart-chem)" : "var(--surface)"}
                strokeWidth={2}
              />
            </g>
          );
        })}
        <text
          x={readings.length > 1 ? lastX - 10 : lastX + 10}
          y={y(v(last.kpa)) - 8}
          textAnchor={readings.length > 1 ? "end" : "start"}
          fontSize={12}
          fontWeight={600}
          fill="var(--foreground)"
          stroke="var(--surface)"
          strokeWidth={3}
          paintOrder="stroke"
          aria-hidden="true"
        >
          {fmt(v(last.kpa))}
        </text>
        <text x={PAD.left} y={H - 6} fontSize={12} fill="var(--muted)">
          {short(readings[0].readOn)}
        </text>
        {readings.length > 1 ? (
          <text x={W - PAD.right} y={H - 6} textAnchor="end" fontSize={12} fill="var(--muted)">
            {short(readings[readings.length - 1].readOn)}
          </text>
        ) : null}
      </svg>
      )}
      </div>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span>● Reading ({unit})</span>
        <span>○ Read just after cleaning</span>
        <span>┄ Clean pressure</span>
        <span>⚠ Clean the filter at clean + {units === "us" ? "8 psi" : "0.55 bar"}</span>
      </figcaption>
      <details className="text-sm">
        <summary className="cursor-pointer font-semibold text-lagoon">Show as a table</summary>
        <table className="mt-2 w-full max-w-sm text-left text-sm">
          <thead>
            <tr className="text-xs text-muted">
              <th className="py-1 font-semibold">Day</th>
              <th className="py-1 font-semibold">Gauge ({unit})</th>
              <th className="py-1 font-semibold">Clean</th>
            </tr>
          </thead>
          <tbody>
            {[...readings].reverse().map((r, i) => (
              <tr key={`${r.readOn}-${i}`} className="border-t border-border">
                <td className="py-1">{short(r.readOn)}</td>
                <td className="py-1">{fmt(v(r.kpa))}</td>
                <td className="py-1">{r.clean ? "Yes" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

