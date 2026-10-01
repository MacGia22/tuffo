"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { removeEntry } from "@/app/app/remove-actions";
import { removedKey, removedToken, type RemovableKind } from "@/lib/removed";
import { withSaved } from "@/lib/return-to";

const NOUN: Record<RemovableKind, string> = {
  reading: "test",
  dose: "dose",
  event: "event",
  maintenance: "entry",
  pressure: "reading",
};

/**
 * Remove, on the edit screen of a test, dose or event. Goes back to where the person came from
 * with "Removed · Undo"; the removed row waits in this tab for Undo.
 */
export function RemoveEntry({ kind, id, returnTo }: { kind: RemovableKind; id: string; returnTo: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState(false);
  const remove = () =>
    start(async () => {
      const result = await removeEntry(kind, id);
      if (!result.ok) {
        setFailed(true);
        return;
      }
      try {
        sessionStorage.setItem(removedKey(id), JSON.stringify(result.row));
      } catch {
        // Private mode: removed without Undo.
      }
      router.push(withSaved(returnTo, removedToken(kind, id)));
    });
  return (
    <div className="flex flex-col gap-1 border-t border-border pt-4">
      <button
        type="button"
        onClick={remove}
        disabled={pending}
        className="self-start rounded-xl px-1 py-2 text-sm font-semibold text-red-700 underline-offset-2 hover:underline disabled:opacity-60 dark:text-red-300"
      >
        {pending ? "Removing…" : `Remove this ${NOUN[kind]}`}
      </button>
      {failed ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          Could not remove it. It may already be gone.
        </p>
      ) : null}
    </div>
  );
}
