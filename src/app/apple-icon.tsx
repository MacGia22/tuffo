import { ImageResponse } from "next/og";
import { brand } from "@/components/brand/logo";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Full-bleed tile: iOS applies its own corner radius.
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: brand.lagoon,
        }}
      >
        <svg viewBox="0 0 100 100" width="180" height="180">
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
      </div>
    ),
    size,
  );
}
