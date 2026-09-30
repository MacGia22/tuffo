"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/user";
import { catalogProduct } from "@/lib/catalog";
import { baseUnitFor, isShelfUnit, shelfToBase } from "@/lib/dose-format";
import { CM_PER_INCH, eventKindInfo } from "@/lib/events";
import type { Units } from "@/lib/format";
import { formFields, isUuid, optionalNumber, text, whenFromForm } from "@/lib/form-data";
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

type Table = "doses" | "events";

/**
 * Inserts a new row, or updates the one named by the form's `id`. Row-level security
 * limits both to the owner's pools. An edit can change what the chlorine model learned
 * from, so it refits the pool after the response; a new dose or event only counts once
 * a later test exists, which refits then.
 */
async function insertOrUpdate(
  table: Table,
  poolId: string,
  id: string,
  row: Record<string, unknown>,
  fail: (error: string) => LogState,
): Promise<LogState | null> {
  const supabase = await createSupabaseServerClient();
  if (id) {
    const { data, error } = await supabase.from(table).update(row).eq("id", id).eq("pool_id", poolId).select("id");
    if (error) return errorState(error.message, fail);
    if (!data || data.length === 0) return fail("That entry is no longer there.");
    recomputeAfterResponse(poolId);
    return null;
  }
  const { error } = await supabase.from(table).insert({ pool_id: poolId, ...row });
  return error ? errorState(error.message, fail) : null;
}

function errorState(message: string, fail: (error: string) => LogState): LogState {
  // Before migration 3 lands, the database does not know drain_refill yet.
  return /events_kind_check/.test(message)
    ? fail("That kind of event is not available yet. Try again in a few minutes.")
    : fail(`Could not save it (${message}).`);
}

/** The entry id an edit form carries, "" for a new entry, or null when it is malformed. */
function entryId(formData: FormData): string | null {
  const id = text(formData, "id");
  return id === "" || isUuid(id) ? id : null;
}

export async function saveDose(_prev: LogState, formData: FormData): Promise<LogState> {
  const poolId = text(formData, "pool_id");
  if (!isUuid(poolId)) return { error: "Unknown pool." };
  const id = entryId(formData);
  if (id === null) return { error: "Unknown dose." };
  await requireUser(id ? `/app/pools/${poolId}/doses/${id}/edit` : `/app/pools/${poolId}/doses/new`);
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

  const when = whenFromForm(formData, "added_at");
  if (!when.ok) return fail(when.error);

  const notes = text(formData, "notes");
  if (notes.length > 2000) return fail("Notes are limited to 2,000 characters.");

  const failed = await insertOrUpdate(
    "doses",
    poolId,
    id,
    {
      product_id: product.id,
      amount: round2(base.amount),
      unit: base.unit,
      ...("iso" in when && when.iso ? { added_at: when.iso } : {}),
      notes: notes || null,
    },
    fail,
  );
  if (failed) return failed;

  revalidatePath(`/app/pools/${poolId}`);
  redirect(`/app/pools/${poolId}`);
}

export async function saveEvent(_prev: LogState, formData: FormData): Promise<LogState> {
  const poolId = text(formData, "pool_id");
  if (!isUuid(poolId)) return { error: "Unknown pool." };
  const id = entryId(formData);
  if (id === null) return { error: "Unknown event." };
  await requireUser(id ? `/app/pools/${poolId}/events/${id}/edit` : `/app/pools/${poolId}/events/new`);
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

  const when = whenFromForm(formData, "occurred_at");
  if (!when.ok) return fail(when.error);

  const notes = text(formData, "notes");
  if (notes.length > 2000) return fail("Notes are limited to 2,000 characters.");
  if (info.kind === "other" && !notes) return fail("Say what happened in the notes.");

  const failed = await insertOrUpdate(
    "events",
    poolId,
    id,
    {
      kind: info.kind,
      value,
      ...("iso" in when && when.iso ? { occurred_at: when.iso } : {}),
      notes: notes || null,
    },
    fail,
  );
  if (failed) return failed;

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
