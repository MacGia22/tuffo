"use client";

import { useActionState } from "react";
import { ConfirmButton } from "@/components/confirm-button";
import { deleteScanPhotos, type PhotoState } from "./actions";

export interface SharedPhoto {
  id: string;
  /** "Oct 4, 2026" */
  date: string;
  kind: "test" | "pump";
  /** A signed URL that works for five minutes; null when it could not be made. */
  url: string | null;
}

const initial: PhotoState = {};
const button =
  "h-11 rounded-xl border border-border px-4 text-sm font-semibold text-red-700 hover:border-red-700 hover:bg-red-50 disabled:opacity-50 dark:text-red-300 dark:hover:bg-red-950/40";

/** The photos this person shared with misread reports, each with Delete, and Delete all. */
export function ScanPhotos({ photos }: { photos: SharedPhoto[] }) {
  const [state, action] = useActionState(deleteScanPhotos, initial);
  return (
    <div className="flex flex-col gap-3">
      {photos.length === 0 ? (
        <p className="text-sm text-muted">You have not shared any photos.</p>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {photos.map((p) => (
              <li key={p.id} className="flex items-center gap-3 rounded-xl border border-border p-2">
                {p.url ? (
                  // A short-lived signed URL from private storage; next/image would cache it.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.url} alt={`Photo shared on ${p.date}`} className="h-16 w-16 shrink-0 rounded-lg object-cover" />
                ) : (
                  <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-background text-xs text-muted">
                    Photo
                  </span>
                )}
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-semibold">{p.date}</p>
                  <p className="text-muted">{p.kind === "pump" ? "Pump schedule" : "Water test"}</p>
                </div>
                <form action={action}>
                  <input type="hidden" name="id" value={p.id} />
                  <ConfirmButton
                    question="Delete this photo? The text of the report stays."
                    label={`Delete the photo shared on ${p.date}`}
                    text="Delete photo"
                    className={button}
                  />
                </form>
              </li>
            ))}
          </ul>
          <form action={action}>
              <input type="hidden" name="id" value="all" />
              <ConfirmButton
                question={`Delete all ${photos.length === 1 ? "1 shared photo" : `${photos.length} shared photos`}? The text of the reports stays.`}
                label="Delete all shared photos"
                text="Delete all"
                className={`${button} self-start`}
              />
            </form>
        </>
      )}
      {state.message ? (
        <p role="status" className="text-sm text-muted">
          {state.message}
        </p>
      ) : null}
      {state.error ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}
