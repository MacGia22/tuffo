"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { restoreEntry } from "@/app/app/remove-actions";
import { undoSaved } from "@/app/app/undo-actions";
import { parseRemoved, removedKey } from "@/lib/removed";
import { parseSaved, withoutSaved } from "@/lib/return-to";

/**
 * After a form saves and returns to the page the person came from (`?saved=`): "Saved",
 * with Undo when the save added a row (a test, dose, event or pump schedule); "Removed"
 * with Undo after a test, dose or event was removed from its edit screen. Closing it,
 * or Undo, takes the marker off the address so a reload does not show it again.
 */
export function SavedNotice() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const token = params.get("saved");
  const removed = parseRemoved(token);
  const saved = removed ? null : parseSaved(token);
  // "Removed." goes away by itself.
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 5000);
    return () => clearTimeout(timer);
  }, [message]);
  if (!saved && !removed && !message) return null;

  const clean = () => {
    const query = params.toString();
    const hash = typeof window === "undefined" ? "" : window.location.hash;
    return withoutSaved(`${pathname}${query ? `?${query}` : ""}${hash}`);
  };
  const close = () => {
    setMessage(null);
    router.replace(clean(), { scroll: false });
  };
  const undo = () =>
    start(async () => {
      if (removed) {
        // Put a removed test, dose or event back from the copy this tab kept.
        let row: unknown = null;
        try {
          row = JSON.parse(sessionStorage.getItem(removedKey(removed.id)) ?? "null");
        } catch {
          row = null;
        }
        const restored = row ? await restoreEntry(removed.kind, row) : false;
        if (restored) {
          try {
            sessionStorage.removeItem(removedKey(removed.id));
          } catch {
            // Nothing to clean up.
          }
        }
        setMessage(restored ? "Put back." : "Could not undo here. Log it again if you need it.");
      } else {
        const undone = await undoSaved(token ?? "");
        setMessage(undone ? "Removed." : "Could not undo: it may already be gone.");
      }
      router.replace(clean(), { scroll: false });
      router.refresh();
    });

  return (
    <div
      role="status"
      className="saved-notice fixed inset-x-0 bottom-4 z-40 mx-auto flex w-fit max-w-[calc(100%-2rem)] items-center gap-3 rounded-xl bg-navy px-4 py-3 text-sm text-white shadow-lg"
    >
      <span>{message ?? (removed ? "Removed" : "Saved")}</span>
      {!message && (removed || (saved && saved !== "saved")) ? (
        <>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={undo}
            disabled={pending}
            className="inline-flex min-h-11 items-center px-1 font-semibold text-ice underline-offset-2 hover:underline disabled:opacity-60"
          >
            {pending ? "Undoing…" : "Undo"}
          </button>
        </>
      ) : null}
      <button type="button" onClick={close} aria-label="Close" className="ml-1 inline-flex h-11 w-11 items-center justify-center text-white/70 hover:text-white">
        ✕
      </button>
    </div>
  );
}
