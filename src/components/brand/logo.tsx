import type { SVGProps } from "react";

/**
 * The Tuffo mark: a dive arc into a wave, with a sun dot.
 * Brand colours live here so every rendering (favicon, OG image, UI) matches.
 */
export const brand = {
  lagoon: "#0E7C9E",
  navy: "#0B2E4F",
  ice: "#8FD3F4",
  sun: "#F5B301",
  light: "#F6FAFC",
  dark: "#0B1620",
} as const;

type MarkProps = SVGProps<SVGSVGElement> & {
  /** Fill of the rounded tile behind the mark. Omit for the bare mark. */
  tile?: string | false;
  /** Colour of the arc and wave. */
  ink?: string;
  /** Colour of the sun dot. */
  sun?: string;
  /** Corner radius of the tile in viewBox units (0-50). */
  radius?: number;
};

export function TuffoMark({
  tile = brand.lagoon,
  ink = "#FFFFFF",
  sun = brand.sun,
  radius = 24,
  ...props
}: MarkProps) {
  return (
    <svg viewBox="0 0 100 100" role="img" aria-label="Tuffo" {...props}>
      {tile ? <rect width="100" height="100" rx={radius} fill={tile} /> : null}
      <circle cx="73" cy="29" r="7" fill={sun} />
      <path
        d="M26 28 C 48 28, 64 40, 64 60"
        stroke={ink}
        strokeWidth="10"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M20 74 q 8 -8 16 0 t 16 0 t 16 0 t 12 0"
        stroke={ink}
        strokeWidth="8"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

type LockupProps = {
  /** Height of the mark in CSS pixels; the wordmark scales with it. */
  size?: number;
  /** Wordmark colour. */
  color?: string;
  className?: string;
};

export function TuffoLockup({ size = 40, color, className }: LockupProps) {
  return (
    <span
      className={`inline-flex items-center gap-[0.22em] ${className ?? ""}`}
      style={{ fontSize: size * 0.82 }}
    >
      <TuffoMark width={size} height={size} />
      <span
        className="font-display font-semibold leading-none tracking-[-0.03em]"
        style={{ color }}
      >
        tuffo
      </span>
    </span>
  );
}
