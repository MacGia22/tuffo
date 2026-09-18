import { createElement as h } from "react";
import { ImageResponse } from "next/og";
import { brand } from "@/components/brand/logo";

/**
 * PWA icons rendered from the vector mark, so the SVG stays the single source of truth
 * and no binary files live in the repository.
 *
 *   /pwa/icon-192.png      rounded tile, transparent corners
 *   /pwa/icon-512.png
 *   /pwa/maskable-192.png  full-bleed tile for maskable icons
 *   /pwa/maskable-512.png
 */
const ICONS: Record<string, { size: number; maskable: boolean }> = {
  "icon-192.png": { size: 192, maskable: false },
  "icon-512.png": { size: 512, maskable: false },
  "maskable-192.png": { size: 192, maskable: true },
  "maskable-512.png": { size: 512, maskable: true },
};

export function generateStaticParams() {
  return Object.keys(ICONS).map((icon) => ({ icon }));
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ icon: string }> },
) {
  const { icon } = await params;
  const spec = ICONS[icon];
  if (!spec) {
    return new Response("Not found", { status: 404 });
  }

  const { size, maskable } = spec;
  const radius = maskable ? 0 : Math.round(size * 0.24);

  const element = h(
    "div",
    {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        background: "transparent",
      },
    },
    h(
      "svg",
      { viewBox: "0 0 100 100", width: size, height: size },
      h("rect", {
        width: 100,
        height: 100,
        rx: (radius / size) * 100,
        fill: brand.lagoon,
      }),
      h("circle", { cx: 73, cy: 29, r: 7, fill: brand.sun }),
      h("path", {
        d: "M26 28 C 48 28, 64 40, 64 60",
        stroke: "#FFFFFF",
        strokeWidth: 10,
        fill: "none",
        strokeLinecap: "round",
      }),
      h("path", {
        d: "M20 74 q 8 -8 16 0 t 16 0 t 16 0 t 12 0",
        stroke: "#FFFFFF",
        strokeWidth: 8,
        fill: "none",
        strokeLinecap: "round",
      }),
    ),
  );

  return new ImageResponse(element, {
    width: size,
    height: size,
    headers: {
      "Cache-Control": "public, max-age=86400, s-maxage=604800, immutable",
    },
  });
}
