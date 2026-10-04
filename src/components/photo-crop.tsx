"use client";

import { useEffect, useRef, type KeyboardEvent, type PointerEvent } from "react";
import { REPORT_PHOTO_MAX_BYTES, REPORT_PHOTO_MAX_EDGE } from "@/lib/scan/report";

/** The kept part of the photo, as fractions of its width and height. */
export interface CropRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

type Edge = keyof CropRect;

export const FULL_CROP: CropRect = { left: 0, top: 0, right: 1, bottom: 1 };
/** The smallest crop, as a share of each side. */
const MIN_SPAN = 0.1;
const EDGES: { edge: Edge; label: string }[] = [
  { edge: "top", label: "Top edge" },
  { edge: "right", label: "Right edge" },
  { edge: "bottom", label: "Bottom edge" },
  { edge: "left", label: "Left edge" },
];

/** Moves one edge to `value`, keeping it inside the photo and at least MIN_SPAN from its opposite. */
export function moveEdge(rect: CropRect, edge: Edge, value: number): CropRect {
  const v = Math.min(1, Math.max(0, value));
  switch (edge) {
    case "left":
      return { ...rect, left: Math.min(v, rect.right - MIN_SPAN) };
    case "right":
      return { ...rect, right: Math.max(v, rect.left + MIN_SPAN) };
    case "top":
      return { ...rect, top: Math.min(v, rect.bottom - MIN_SPAN) };
    case "bottom":
      return { ...rect, bottom: Math.max(v, rect.top + MIN_SPAN) };
  }
}

/**
 * Cuts the kept part out of the photo on the device and encodes it as JPEG, at most
 * REPORT_PHOTO_MAX_EDGE px on the long side and under the server's size limit. Drawing
 * through a canvas also drops any EXIF or GPS data.
 */
export async function cropToJpeg(photo: Blob, rect: CropRect): Promise<Blob> {
  const bitmap = await createImageBitmap(photo);
  try {
    const sx = Math.round(rect.left * bitmap.width);
    const sy = Math.round(rect.top * bitmap.height);
    const sw = Math.max(1, Math.round((rect.right - rect.left) * bitmap.width));
    const sh = Math.max(1, Math.round((rect.bottom - rect.top) * bitmap.height));
    const scale = Math.min(1, REPORT_PHOTO_MAX_EDGE / Math.max(sw, sh));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(sw * scale));
    canvas.height = Math.max(1, Math.round(sh * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.85, 0.7, 0.55]) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size <= REPORT_PHOTO_MAX_BYTES) return blob;
    }
    throw new Error("too-large");
  } finally {
    bitmap.close();
  }
}

/**
 * The photo with four draggable edges. Each edge has a 44 px handle; a focused handle
 * moves with the arrow keys (Shift for bigger steps). Nothing leaves the device here.
 */
export function PhotoCrop({ photo, value, onChange }: { photo: Blob; value: CropRect; onChange: (rect: CropRect) => void }) {
  const image = useRef<HTMLImageElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const dragging = useRef<Edge | null>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(photo);
    if (image.current) image.current.src = objectUrl;
    return () => URL.revokeObjectURL(objectUrl);
  }, [photo]);

  function fromPointer(edge: Edge, event: PointerEvent) {
    const box = frame.current?.getBoundingClientRect();
    if (!box || box.width === 0 || box.height === 0) return;
    const horizontal = edge === "left" || edge === "right";
    const position = horizontal ? (event.clientX - box.left) / box.width : (event.clientY - box.top) / box.height;
    onChange(moveEdge(value, edge, position));
  }

  function onKey(edge: Edge, event: KeyboardEvent) {
    const step = event.shiftKey ? 0.05 : 0.01;
    const horizontal = edge === "left" || edge === "right";
    const delta =
      horizontal && event.key === "ArrowLeft"
        ? -step
        : horizontal && event.key === "ArrowRight"
          ? step
          : !horizontal && event.key === "ArrowUp"
            ? -step
            : !horizontal && event.key === "ArrowDown"
              ? step
              : 0;
    if (delta === 0) return;
    event.preventDefault();
    onChange(moveEdge(value, edge, value[edge] + delta));
  }

  const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
  const handlePosition = (edge: Edge) => {
    const midX = pct((value.left + value.right) / 2);
    const midY = pct((value.top + value.bottom) / 2);
    switch (edge) {
      case "top":
        return { left: midX, top: pct(value.top) };
      case "bottom":
        return { left: midX, top: pct(value.bottom) };
      case "left":
        return { left: pct(value.left), top: midY };
      case "right":
        return { left: pct(value.right), top: midY };
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Padding keeps the 44 px handles inside the panel when an edge sits at the photo's border. */}
      <div className="self-start p-[22px]">
        <div ref={frame} className="relative touch-none select-none overflow-visible">
          {/* A local object URL of the person's own photo; next/image cannot load it. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img ref={image} alt="The scanned photo" draggable={false} className="block max-h-[60vh] w-auto max-w-full rounded-lg" />
          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg">
            <div
              className="absolute border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] outline outline-1 outline-black/40"
              style={{ left: pct(value.left), top: pct(value.top), width: pct(value.right - value.left), height: pct(value.bottom - value.top) }}
            />
          </div>
          {EDGES.map(({ edge, label }) => {
            const horizontal = edge === "left" || edge === "right";
            const now = Math.round(value[edge] * 100);
            return (
              <button
                key={edge}
                type="button"
                role="slider"
                aria-label={label}
                aria-orientation={horizontal ? "horizontal" : "vertical"}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={now}
                aria-valuetext={`${now}% from the ${horizontal ? "left" : "top"}`}
                onKeyDown={(e) => onKey(edge, e)}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  dragging.current = edge;
                }}
                onPointerMove={(e) => {
                  if (dragging.current === edge) fromPointer(edge, e);
                }}
                onPointerUp={(e) => {
                  dragging.current = null;
                  e.currentTarget.releasePointerCapture(e.pointerId);
                }}
                onPointerCancel={() => {
                  dragging.current = null;
                }}
                className={`absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full outline-none focus-visible:ring-4 focus-visible:ring-lagoon/60 ${
                  horizontal ? "cursor-ew-resize" : "cursor-ns-resize"
                }`}
                style={handlePosition(edge)}
              >
                <span
                  aria-hidden="true"
                  className={`block rounded-full border-2 border-lagoon bg-white shadow ${horizontal ? "h-7 w-2.5" : "h-2.5 w-7"}`}
                />
              </button>
            );
          })}
        </div>
      </div>
      <p className="text-xs text-muted">
        Drag the edges, or tab to an edge and use the arrow keys. Only the part inside the frame is sent.
      </p>
    </div>
  );
}
