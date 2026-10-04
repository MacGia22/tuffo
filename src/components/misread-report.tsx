"use client";

import { useState } from "react";
import { cropToJpeg, FULL_CROP, PhotoCrop, type CropRect } from "@/components/photo-crop";
import { NO_CHANGES_TEXT, REPORT_NOTE_MAX, type ReportChange, type ReportKind } from "@/lib/scan/report";

/**
 * "Read something wrong? Report it": a link under the Scan button that opens an inline
 * panel. It lists what the scan read against what is in the form now, takes an optional
 * note and, only when the box is ticked, the cropped photo. Sending never saves or
 * changes the test or schedule; the person still taps Save. Remount it (a new `key`)
 * after each scan.
 */
export function MisreadReport({
  kind,
  source,
  read,
  changes,
  photo,
}: {
  kind: ReportKind;
  /** Where the scan says the result came from (leslies, test_strip…). */
  source?: string;
  /** What the scan put in the form, stored as the report's `read`. */
  read: Record<string, unknown>;
  /** The fields changed since the scan, worked out from the form as it is now. */
  changes: ReportChange[];
  /** The photo as scanned, kept in memory only; null hides the share option. */
  photo: Blob | null;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [share, setShare] = useState(false);
  const [crop, setCrop] = useState<CropRect>(FULL_CROP);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();
  const [sent, setSent] = useState<{ photo: boolean } | null>(null);

  if (sent) {
    return (
      <p role="status" className="rounded-xl bg-ice/20 px-3 py-2 text-sm">
        Thanks, report sent.
        {sent.photo ? " You can delete the photo in Account, Shared scan photos." : ""}
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 items-center self-start text-sm font-semibold text-lagoon underline underline-offset-4 hover:text-lagoon-deep"
      >
        Read something wrong? Report it
      </button>
    );
  }

  async function send() {
    if (changes.length === 0 || sending) return;
    setSending(true);
    setError(undefined);
    try {
      const body = new FormData();
      const withPhoto = share && photo !== null;
      body.append(
        "report",
        JSON.stringify({
          kind,
          source,
          read,
          corrected: Object.fromEntries(changes.map((c) => [c.key, c.value])),
          note: note.trim(),
          photoConsent: withPhoto,
        }),
      );
      if (withPhoto) {
        try {
          body.append("photo", await cropToJpeg(photo, crop), "report.jpg");
        } catch {
          setError("The photo could not be prepared on this device. Untick the box to send the report without it.");
          return;
        }
      }
      const response = await fetch("/api/scan-report", { method: "POST", body });
      const data = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string; photo?: boolean };
      if (!response.ok || !data.ok) {
        setError(data.error ?? "The report could not be sent. Try again in a minute.");
        return;
      }
      setSent({ photo: data.photo === true });
    } catch {
      setError("The report could not be sent. Check the connection and try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <section aria-labelledby="misread-title" className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4">
      <h2 id="misread-title" className="text-base font-semibold">
        Report a misread
      </h2>

      {changes.length > 0 ? (
        <ul className="flex flex-col gap-1 text-sm">
          {changes.map((c) => (
            <li key={c.key}>{c.text}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">{NO_CHANGES_TEXT}</p>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="misread-note" className="text-sm font-semibold">
          What went wrong? <span className="font-normal text-muted">(optional)</span>
        </label>
        <textarea
          id="misread-note"
          rows={2}
          maxLength={REPORT_NOTE_MAX}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          aria-describedby="misread-note-count"
          className="rounded-xl border border-border-input bg-background px-3 py-2 text-base outline-none focus:border-lagoon focus:ring-2 focus:ring-lagoon/30"
        />
        <p id="misread-note-count" className="text-xs text-muted">
          {note.length} of {REPORT_NOTE_MAX} characters
        </p>
      </div>

      {photo ? (
        <div className="flex flex-col gap-2">
          <label className="flex min-h-11 items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={share}
              onChange={(e) => setShare(e.target.checked)}
              aria-describedby="misread-share-help"
              className="mt-0.5 h-5 w-5 shrink-0 accent-lagoon"
            />
            <span className="font-semibold">Also share the photo so Tuffo can see what went wrong.</span>
          </label>
          <p id="misread-share-help" className="text-xs text-muted">
            Optional. Crop out names, addresses and account numbers first. The photo is kept for up to 12 months, seen
            only by Tuffo, may be run through the scanner again to test fixes, and is never published or sold. Delete it
            any time from your account.
          </p>
          {share ? (
            <fieldset className="flex flex-col gap-1">
              <legend className="mb-1 text-sm font-semibold">Crop</legend>
              <PhotoCrop photo={photo} value={crop} onChange={setCrop} />
            </fieldset>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void send()}
          disabled={changes.length === 0 || sending}
          className="h-11 rounded-xl bg-action px-5 text-sm font-semibold text-white hover:bg-action-deep disabled:opacity-60"
        >
          {sending ? "Sending…" : "Send report"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(undefined);
          }}
          className="h-11 rounded-xl px-3 text-sm font-semibold text-muted hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </section>
  );
}
