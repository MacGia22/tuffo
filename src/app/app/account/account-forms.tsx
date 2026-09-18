"use client";

import { useActionState } from "react";
import type { Units } from "@/lib/format";
import { deleteAccount, updateUnits, type AccountState } from "./actions";

const initial: AccountState = {};

export function UnitsForm({ units }: { units: Units }) {
  const [state, action, pending] = useActionState(updateUnits, initial);
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="units" value="us" defaultChecked={units === "us"} className="accent-lagoon" />
          Gallons, °F, ounces and pounds
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="units" value="metric" defaultChecked={units === "metric"} className="accent-lagoon" />
          Liters, °C, grams and kilograms
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:border-lagoon disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {state.message ? <span className="text-sm text-muted">{state.message}</span> : null}
        {state.error ? <span className="text-sm text-red-600">{state.error}</span> : null}
      </div>
    </form>
  );
}

export function DeleteForm() {
  const [state, action, pending] = useActionState(deleteAccount, initial);
  return (
    <form action={action} className="flex flex-col gap-3">
      <label htmlFor="confirm" className="text-sm">
        Type <span className="font-mono font-semibold">DELETE</span> to remove your account, pools and every test.
        This cannot be undone.
      </label>
      <div className="flex gap-2">
        <input
          id="confirm"
          name="confirm"
          autoComplete="off"
          className="h-11 max-w-xs flex-1 rounded-xl border border-border bg-surface px-3 text-base outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/30"
        />
        <button
          type="submit"
          disabled={pending}
          className="h-11 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
        >
          {pending ? "Deleting…" : "Delete my account"}
        </button>
      </div>
      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
    </form>
  );
}
