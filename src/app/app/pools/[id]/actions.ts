"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/user";
import { catalogProduct } from "@/lib/catalog";
import { baseUnitFor, isShelfUnit, shelfToBase } from "@/lib/dose-format";
import { CM_PER_INCH, eventKindInfo } from "@/lib/events";
import type { Units } from "@/lib/format";
import { formFields, instantFromLocal, isUuid, optionalNumber, text } from "@/lib/form-data";
import { recomputeAfterResponse } from "@/lib/model/recompute";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface LogState {
  error?: string;
  fields?: Record<string, string>;
}

/** Most anyone would add at once: 400 L of liquid or 1,000 kg of solids (a new salt pool). */
const MAX_BASE = { mL: 400_000, g: 1_000_000 } as const;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export async function createDose(_prev: LogState, formData: FormData): Promise<LogState> {
  const poolId = text(formData, "pool_id");
  if (!isUuid(poolId)) return { error: "Unknown pool." };
  await requireUser(`/app/pools/${poolId}/doses/new`);
  const fields = formFields(formData);
  const fail = (error: string): LogState => ({ error, fields });

  const product = catalogProduct(text(formData, "product"));
  if (!product) return fail("Pick the product you added.");

  const amount = optionalNumber(formData, "amount");
  if (amount === null || amount === "invalid" || amount <= 0) return fail("Enter how much you added.");

  const unit = text(formData, "unit");
  if (!isShelfUnit(unit)) return fail("Pick a unit.");
  const base = shelfToBase(amount, unit);
  if (base.unit !== baseUnitFor(product.form)) {
    return fail(product.form === "liquid" ? "That product is a liquid: pick a volume." : "That product is a solid: pick a weight.");
  }
  if (base.amount > MAX_BASE[base.unit]) return fail("That is more than a pool takes in one go. Check the unit.");

  const when = instantFromLocal(text(formData, "added_at"), Number(text(formData, "tz_offset") || "0"));
  if (!when.ok) return fail(when.error);

  const notes = text(formData, "notes");
  if (notes.length > 2000) return fail("Notes are limited to 2,000 characters.");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("doses").insert({
    pool_id: poolId,
    product_id: product.id,
    amount: round2(base.amount),
    unit: base.unit,
    ...(when.iso ? { added_at: when.iso } : {}),
    notes: notes || null,
  });
  if (error) return fail(`Could not save it (${error.message}).`);

  revalidatePath(`/app/pools/${poolId}`);
  redirect(`/app/pools/${poolId}`);
}

export async function createEvent(_prev: LogState, formData: FormData): Promise<LogState> {
  const poolId = text(formData, "pool_id");
  if (!isUuid(poolId)) return { error: "Unknown pool." };
  await requireUser(`/app/pools/${poolId}/events/new`);
  const fields = formFields(formData);
  const fail = (error: string): LogState => ({ error, fields });

  const info = eventKindInfo(text(formData, "kind"));
  if (!info) return fail("Pick what happened.");

  let value: number | null = null;
  if (info.value) {
    const raw = optionalNumber(formData, "value");
    if (raw === "invalid") return fail("That number does not look right.");
    if (raw !== null) {
      if (raw <= 0) return fail("Use a positive number, or leave it empty.");
      if (info.value === "depth") {
        const units: Units = text(formData, "units") === "metric" ? "metric" : "us";
        value = round2(units === "us" ? raw * CM_PER_INCH : raw);
        if (value > 300) return fail("That is more water than most pools hold above the floor. Check the unit.");
      } else {
        value = Math.round(raw);
        if (value > 500) return fail("That is a lot of swimmers. Check the number.");
      }
    }
  }

  const when = instantFromLocal(text(formData, "occurred_at"), Number(text(formData, "tz_offset") || "0"));
  if (!when.ok) return fail(when.error);

  const notes = text(formData, "notes");
  if (notes.length > 2000) return fail("Notes are limited to 2,000 characters.");
  if (info.kind === "other" && !notes) return fail("Say what happened in the notes.");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("events").insert({
    pool_id: poolId,
    kind: info.kind,
    value,
    ...(when.iso ? { occurred_at: when.iso } : {}),
    notes: notes || null,
  });
  if (error) {
    // Before migration 3 lands, the database does not know drain_refill yet.
    const unknownKind = /events_kind_check/.test(error.message);
    return fail(unknownKind ? "That kind of event is not available yet. Try again in a few minutes." : `Could not save it (${error.message}).`);
  }

  revalidatePath(`/app/pools/${poolId}`);
  redirect(`/app/pools/${poolId}`);
}

const TABLES = { reading: "readings", dose: "doses", event: "events" } as const;

/** Removes one test, dose or event. Row-level security limits it to the owner's pools. */
export async function deleteEntry(formData: FormData): Promise<void> {
  const poolId = text(formData, "pool_id");
  const id = text(formData, "id");
  const kind = text(formData, "kind") as keyof typeof TABLES;
  if (!isUuid(poolId) || !isUuid(id) || !(kind in TABLES)) return;
  await requireUser(`/app/pools/${poolId}`);

  const supabase = await createSupabaseServerClient();
  const { data: removed } = await supabase.from(TABLES[kind]).delete().eq("id", id).eq("pool_id", poolId).select("id");
  // A removed test, dose or event changes what the chlorine model learned from.
  if (removed && removed.length > 0) recomputeAfterResponse(poolId);
  revalidatePath(`/app/pools/${poolId}`);
}
