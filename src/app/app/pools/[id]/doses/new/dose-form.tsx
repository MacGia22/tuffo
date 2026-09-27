"use client";

import { useActionState, useRef, useState } from "react";
import { CATALOG, CATALOG_GROUPS, catalogProduct } from "@/lib/catalog";
import { shelfUnits, type ShelfUnit } from "@/lib/dose-format";
import type { Units } from "@/lib/format";
import { createDose, type LogState } from "../../actions";

const initial: LogState = {};

const input =
  "h-11 w-full rounded-xl border border-border bg-surface px-3 text-base text-foreground outline-none placeholder:text-muted/70 focus:border-lagoon focus:ring-2 focus:ring-lagoon/30";

export interface DosePrefill {
  product?: string;
  amount?: string;
  unit?: ShelfUnit;
}

function defaultUnit(productId: string, units: Units): ShelfUnit {
  const product = catalogProduct(productId) ?? CATALOG[0];
  const options = shelfUnits(product.form, units);
  return options[1] ?? options[0];
}

export function DoseForm({ poolId, units, prefill }: { poolId: string; units: Units; prefill: DosePrefill }) {
  const [state, action, pending] = useActionState(createDose, initial);
  const f = state.fields ?? {};
  const tzOffset = useRef<HTMLInputElement>(null);

  const [productId, setProductId] = useState(f.product ?? prefill.product ?? "liquid-chlorine-12.5");
  const product = catalogProduct(productId) ?? CATALOG[0];
  const options = shelfUnits(product.form, units);
  const [unit, setUnit] = useState<ShelfUnit>(
    (f.unit as ShelfUnit) ?? prefill.unit ?? defaultUnit(productId, units),
  );
  const unitValid = options.includes(unit);

  return (
    <form
      action={action}
      onSubmit={() => {
        if (tzOffset.current) tzOffset.current.value = String(new Date().getTimezoneOffset());
      }}
      className="flex max-w-xl flex-col gap-6"
    >
      <input type="hidden" name="pool_id" value={poolId} />
      <input type="hidden" name="tz_offset" ref={tzOffset} defaultValue="0" />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="product" className="text-sm font-semibold">
          What did you add?
        </label>
        <select
          id="product"
          name="product"
          value={productId}
          onChange={(e) => {
            const next = e.target.value;
            setProductId(next);
            const nextOptions = shelfUnits((catalogProduct(next) ?? CATALOG[0]).form, units);
            if (!nextOptions.includes(unit)) setUnit(defaultUnit(next, units));
          }}
          className={input}
        >
          {CATALOG_GROUPS.map((group) => (
            <optgroup key={group} label={group}>
              {CATALOG.filter((p) => p.group === group).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="amount" className="text-sm font-semibold">
          How much?
        </label>
        <div className="flex gap-2">
          <input
            id="amount"
            name="amount"
            type="number"
            inputMode="decimal"
            step="any"
            min={0}
            required
            defaultValue={f.amount ?? prefill.amount ?? ""}
            placeholder={product.form === "liquid" ? "2.5" : "1"}
            className={input}
          />
          <select
            aria-label="Unit"
            name="unit"
            value={unitValid ? unit : options[0]}
            onChange={(e) => setUnit(e.target.value as ShelfUnit)}
            className="h-11 rounded-xl border border-border bg-surface px-3 text-base"
          >
            {options.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="added_at" className="text-sm font-semibold">
            When <span className="font-normal text-muted">(empty = now)</span>
          </label>
          <input id="added_at" name="added_at" type="datetime-local" defaultValue={f.added_at ?? ""} className={input} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="notes" className="text-sm font-semibold">
            Notes <span className="font-normal text-muted">(optional)</span>
          </label>
          <input id="notes" name="notes" maxLength={2000} defaultValue={f.notes ?? ""} className={input} />
        </div>
      </div>

      {state.error ? (
        <p role="alert" className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="h-12 self-start rounded-xl bg-lagoon px-6 text-base font-semibold text-white transition hover:bg-lagoon-deep disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
