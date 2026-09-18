import { ImageResponse } from "next/og";
import { brand } from "@/components/brand/logo";
import { TAGLINE, WORDMARK } from "@/components/brand/wordmark-path";

export const alt = "Tuffo — your pool, forecast.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The wordmark and tagline are outlined paths, so the image needs no font files.
export default function OpenGraphImage() {
  const wordmarkScale = 3.2; // 64px em → about 205px cap height
  const wordmarkWidth = 153 * wordmarkScale;
  const wordmarkHeight = 80.6 * wordmarkScale;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          background: brand.navy,
          padding: "0 120px",
          gap: 64,
        }}
      >
        <svg viewBox="0 0 100 100" width="280" height="280">
          <rect width="100" height="100" rx="24" fill={brand.lagoon} />
          <circle cx="73" cy="29" r="7" fill={brand.sun} />
          <path
            d="M26 28 C 48 28, 64 40, 64 60"
            stroke="#FFFFFF"
            strokeWidth="10"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M20 74 q 8 -8 16 0 t 16 0 t 16 0 t 12 0"
            stroke="#FFFFFF"
            strokeWidth="8"
            fill="none"
            strokeLinecap="round"
          />
        </svg>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <svg viewBox={WORDMARK.viewBox} width={wordmarkWidth} height={wordmarkHeight}>
            <path transform={`translate(0,${WORDMARK.baseline})`} d={WORDMARK.d} fill="#FFFFFF" />
          </svg>
          <svg viewBox="0 -32 420 48" width={420 * 1.15} height={48 * 1.15}>
            <path d={TAGLINE.d} fill={brand.ice} />
          </svg>
        </div>
      </div>
    ),
    size,
  );
}
