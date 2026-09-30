"use client";

import Link from "next/link";
import { useActionState } from "react";
import { PlacePicker } from "@/components/place-picker";
import { findPlaces } from "../../new/actions";
import { saveLocation, type LocationState } from "../actions";

const initial: LocationState = {};

export function LocationForm({ poolId }: { poolId: string }) {
  const [state, action, pending] = useActionState(saveLocation, initial);

  if (state.saved) {
    return (
      <p role="status" className="rounded-2xl border border-border bg-surface p-4">
        Saved. Tuffo is loading the weather for the new location; it shows on the pool page in a minute.{" "}
        <Link href={`/app/pools/${poolId}`} className="font-semibold text-lagoon underline-offset-2 hover:underline">
          Back to the pool
        </Link>
      </p>
    );
  }

  return (
    <form action={action} className="flex max-w-xl flex-col gap-4">
      <input type="hidden" name="pool_id" value={poolId} />
      <PlacePicker find={findPlaces} />
      {state.error ? (
        <p role="alert" className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="h-12 self-start rounded-xl bg-lagoon px-6 text-base font-semibold text-white hover:bg-lagoon-deep disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save location"}
      </button>
    </form>
  );
}
