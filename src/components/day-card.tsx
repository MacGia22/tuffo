import type { ReactNode } from "react";
import { UvChip } from "@/components/uv-chip";

/**
 * One day, the same everywhere (the public forecast, Next 7 days, the Trends readout):
 * the day (Today outlined), the action or dose, free chlorine by evening, the UV chip,
 * then rain. Days ahead have a dashed outline; a day at risk uses the warning colours.
 */
export function DayCard({
  as: Tag = "li",
  day,
  dateText,
  today = false,
  ahead = false,
  risk = null,
  actions = [],
  fc = null,
  fcLabel = "FC by evening",
  uv = null,
  rain = null,
  children,
  className = "",
}: {
  as?: "li" | "div";
  /** "Today", "Sat" */
  day: string;
  /** "Oct 3" */
  dateText: string;
  today?: boolean;
  /** A forecast day (after today). */
  ahead?: boolean;
  /** A warning line, "May run low": the card takes the warning colours. */
  risk?: string | null;
  actions?: ReactNode[];
  /** "≈ 7.8" (or "8.0 measured") */
  fc?: string | null;
  fcLabel?: string;
  uv?: number | null;
  /** "0.3 in · 60%", "Dry" */
  rain?: string | null;
  /** Lines after the rain (stabilizer after heavy rain, a link). */
  children?: ReactNode;
  className?: string;
}) {
  const frame = today
    ? "border-2 border-lagoon bg-surface"
    : risk
      ? "border border-chip-warn-fg/50 bg-chip-warn-bg text-chip-warn-fg"
      : ahead
        ? "border border-dashed border-border-input bg-surface"
        : "border border-border bg-surface";
  return (
    <Tag aria-current={today ? "date" : undefined} className={`flex flex-col gap-1.5 rounded-2xl p-3 text-sm ${frame} ${className}`}>
      <p className="leading-tight">
        <span className={`block font-semibold ${today ? "text-lagoon" : ""}`}>{day}</span>
        <span className={`text-xs ${risk ? "" : "text-muted"}`}>{dateText}</span>
      </p>
      {actions.map((a, i) => (
        <p key={i} className="font-semibold leading-tight">
          {a}
        </p>
      ))}
      {fc ? (
        <p className={`text-xs ${risk ? "" : "text-muted"}`}>
          {fcLabel} <span className="font-semibold text-foreground">{fc}</span>
        </p>
      ) : null}
      {uv !== null ? <UvChip index={uv} /> : null}
      {rain ? (
        <p className="text-xs">
          {rain === "Dry" ? null : <span className="sr-only">Rain </span>}
          {rain}
        </p>
      ) : null}
      {risk ? <p className="text-xs font-semibold">{risk}</p> : null}
      {children}
    </Tag>
  );
}
