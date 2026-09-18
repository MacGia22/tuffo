"use client";

import { useRef, useState } from "react";

export interface ScanResponse {
  ok: boolean;
  error?: string;
  fields?: Record<string, number>;
  waterTempC?: number | null;
  method?: string;
  testDate?: string | null;
  confidence?: "high" | "medium" | "low";
  uncertain?: string[];
  notes?: string | null;
}

const MAX_EDGE = 1800;

/** Shrinks a photo in the browser so uploads stay small; falls back to the original. */
async function downscale(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("encode"))), "image/jpeg", 0.85),
    );
  } catch {
    return file;
  }
}

export function ScanButton({ onResult, disabled }: { onResult: (result: ScanResponse) => void; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function handle(file: File) {
    setBusy(true);
    setError(undefined);
    try {
      const blob = await downscale(file);
      const body = new FormData();
      body.append("image", blob, "test.jpg");
      const response = await fetch("/api/scan", { method: "POST", body });
      const data = (await response.json()) as ScanResponse;
      if (!response.ok || !data.ok) {
        setError(data.error ?? "Could not read that photo.");
        return;
      }
      onResult(data);
    } catch {
      setError("Could not read that photo. Try again.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handle(file);
        }}
      />
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy || disabled}
        className="inline-flex h-11 items-center gap-2 self-start rounded-xl border border-lagoon px-4 text-sm font-semibold text-lagoon hover:bg-lagoon/10 disabled:opacity-60"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M4 8a2 2 0 0 1 2-2h2l1.5-2h5L16 6h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
          <circle cx="12" cy="12.5" r="3.5" />
        </svg>
        {busy ? "Reading the photo…" : "Scan a printout or strip"}
      </button>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
