"use client";

import { useState } from "react";

/** Copies the result's link (place, weather area and pool numbers; no ref label). */
export function CopyLink({ href }: { href: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const url = typeof window === "undefined" ? href : new URL(href, window.location.origin).toString();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setState("copied");
          } catch {
            setState("failed");
          }
        }}
        className="h-11 rounded-xl border border-border px-4 text-sm font-semibold hover:border-lagoon"
      >
        Copy link
      </button>
      <span role="status" className="text-sm text-muted">
        {state === "copied" ? "Link copied." : state === "failed" ? "Copy did not work; the link is below." : ""}
      </span>
      {state === "failed" ? (
        <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="Link to this forecast" className="h-11 w-full rounded-xl border border-border-input bg-surface px-3 text-sm" />
      ) : null}
    </div>
  );
}
