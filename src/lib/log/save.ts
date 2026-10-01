import "server-only";

import { catalogProduct } from "@/lib/catalog";
import { baseUnitFor, isShelfUnit, shelfToBase } from "@/lib/dose-format";
import { CM_PER_INCH, eventKindInfo } from "@/lib/events";
import type { Units } from "@/lib/format";
import { isUuid, optionalNumber, text, whenFromForm } from "@/lib/form-data";
import { recomputeAfterResponse } from "@/lib/model/recompute";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Validates and stores one test, dose or event from its form fields, as the signed-in
 * user (row-level security limits it to their pools). Used by the log forms' server
 * actions and by POST /api/log, which sends entries queued offline. The caller checks
 * that someone is signed in.
 *
 * A new entry may carry `client_id`, a UUID made on the device. The column is unique, so
 * a second send of the same entry fails with 23505 and counts as already saved. With an
 * `id`, the entry is an edit of an existing row.
 */

/** `transient` marks a database hiccup worth retrying, as opposed to a refused value. */
export type SaveResult = { ok: true; poolId: string; /** A new row's id (for Undo). */ id?: string } | { ok: false; error: string; transient?: boolean };

export type LogKind = "reading" | "dose" | "event";

/** Most anyone would add at once: 400 L of liquid or 1,000 kg of solids (a new salt pool). */
const MAX_BASE = { mL: 400_000, g: 1_000_000 } as const;

// "imported" is set by the CSV import; an edit keeps it.
const METHODS = new Set(["drop_kit", "strips", "digital", "store_leslies", "store_pinch", "monitor", "other", "imported"]);

const RANGES: Record<string, { min: number; max: number; label: string }> = {
  fc: { min: 0, max: 100, label: "Free chlorine" },
  cc: { min: 0, max: 50, label: "Combined chlorine" },
  ph: { min: 5, max: 10, label: "pH" },
  ta: { min: 0, max: 1000, label: "Alkalinity" },
  ch: { min: 0, max: 3000, label: "Calcium" },
  cya: { min: 0, max: 500, label: "Stabilizer" },
  salt: { min: 0, max: 20000, label: "Salt" },
  borate: { min: 0, max: 200, label: "Borates" },
  phosphate: { min: 0, max: 20000, label: "Phosphates" },
};

const TABLES = { reading: "readings", dose: "doses", event: "events" } as const;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function fail(error: string): SaveResult {
  return { ok: false, error };
}

/** "" for a new entry, the id for an edit, or null when malformed. */
function ids(formData: FormData): { id: string; clientId: string } | null {
  const id = text(formData, "id");
  const clientId = text(formData, "client_id");
  if (id !== "" && !isUuid(id)) return null;
  if (clientId !== "" && !isUuid(clientId)) return null;
  return { id, clientId };
}

async function store(kind: LogKind, poolId: string, entry: { id: string; clientId: string }, row: Record<string, unknown>): Promise<SaveResult> {
  const supabase = await createSupabaseServerClient();
  const table = TABLES[kind];
  if (entry.id) {
    const { data, error } = await supabase.from(table).update(row).eq("id", entry.id).eq("pool_id", poolId).select("id");
    if (error) return storeError(error.message);
    if (!data || data.length === 0) return fail("That entry is no longer there.");
    // An edit changes what the chlorine model learned from.
    recomputeAfterResponse(poolId);
    return { ok: true, poolId };
  }
  const { data: inserted, error } = await supabase
    .from(table)
    .insert({ pool_id: poolId, ...row, ...(entry.clientId ? { client_id: entry.clientId } : {}) })
    .select("id")
    .returns<{ id: string }[]>();
  if (error) {
    // Sent before (a retry after a lost reply): the row is already there.
    if (error.code === "23505" && /client_id/.test(`${error.message} ${error.details ?? ""}`)) return { ok: true, poolId };
    return storeError(error.message);
  }
  const newId = inserted?.[0]?.id;
  // A new test forms a pair with the one before it, and a cell setting changes what the
  // cell made; other doses and events count once a later test exists.
  if (kind === "reading" || row.kind === "cell_setting") recomputeAfterResponse(poolId);
  return { ok: true, poolId, id: newId };
}

function storeError(message: string): SaveResult {
  // Before a migration lands, the database may not know a new value yet.
  if (/events_kind_check/.test(message)) {
    return { ok: false, error: "That kind of event is not available yet. Try again in a few minutes.", transient: true };
  }
  if (/client_id/.test(message)) return { ok: false, error: "Tuffo is being updated. Try again in a few minutes.", transient: true };
  return { ok: false, error: `Could not save it (${message}).`, transient: true };
}

export async function saveReadingEntry(formData: FormData): Promise<SaveResult> {
  const poolId = text(formData, "pool_id");
  if (!isUuid(poolId)) return fail("Unknown pool.");
  const entry = ids(formData);
  if (!entry) return fail("Unknown test.");

  const row: Record<string, number | string | null> = {};
  let any = false;
  for (const [key, range] of Object.entries(RANGES)) {
    const value = optionalNumber(formData, key);
    if (value === "invalid") return fail(`${range.label} must be a number.`);
    if (value !== null && (value < range.min || value > range.max)) {
      return fail(`${range.label} ${value} is outside the range a test can report.`);
    }
    row[key] = value;
    if (value !== null) any = true;
  }
  if (!any) return fail("Enter at least one result.");

  const units: Units = text(formData, "units") === "metric" ? "metric" : "us";
  const temp = optionalNumber(formData, "water_temp");
  if (temp === "invalid") return fail("Water temperature must be a number.");
  if (temp !== null) {
    const celsius = units === "us" ? ((temp - 32) * 5) / 9 : temp;
    if (celsius < -5 || celsius > 60) return fail("That water temperature does not look right.");
    row.water_temp_c = Math.round(celsius * 10) / 10;
  } else {
    row.water_temp_c = null;
  }

  const method = text(formData, "method") || "drop_kit";
  if (!METHODS.has(method)) return fail("Pick how the water was tested.");
  row.method = method;

  const when = whenFromForm(formData, "taken_at");
  if (!when.ok) return fail(when.error);
  if ("iso" in when && when.iso) row.taken_at = when.iso;

  const notes = text(formData, "notes");
  if (notes.length > 2000) return fail("Notes are limited to 2,000 characters.");
  row.notes = notes || null;

  return store("reading", poolId, entry, row);
}

export async function saveDoseEntry(formData: FormData): Promise<SaveResult> {
  const poolId = text(formData, "pool_id");
  if (!isUuid(poolId)) return fail("Unknown pool.");
  const entry = ids(formData);
  if (!entry) return fail("Unknown dose.");

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

  return store("dose", poolId, entry, {
    product_id: product.id,
    amount: round2(base.amount),
    unit: base.unit,
    ...("iso" in when && when.iso ? { added_at: when.iso } : {}),
    notes: notes || null,
  });
}

export async function saveEventEntry(formData: FormData): Promise<SaveResult> {
  const poolId = text(formData, "pool_id");
  if (!isUuid(poolId)) return fail("Unknown pool.");
  const entry = ids(formData);
  if (!entry) return fail("Unknown event.");

  const info = eventKindInfo(text(formData, "kind"));
  if (!info) return fail("Pick what happened.");

  let value: number | null = null;
  if (info.value) {
    const raw = optionalNumber(formData, "value");
    if (raw === "invalid") return fail("That number does not look right.");
    if (raw === null && info.value === "percent") return fail("Enter the new setting in percent.");
    if (raw !== null) {
      if (raw < 0 || (raw === 0 && info.value !== "percent")) return fail("Use a positive number, or leave it empty.");
      if (info.value === "percent") {
        // Half percents for cells set in 12.5% steps (CircuPool EDGE).
        value = Math.round(raw * 2) / 2;
        if (value > 100) return fail("A cell setting goes up to 100%.");
      } else if (info.value === "depth") {
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

  return store("event", poolId, entry, {
    kind: info.kind,
    value,
    ...("iso" in when && when.iso ? { occurred_at: when.iso } : {}),
    notes: notes || null,
  });
}

export const SAVERS: Record<LogKind, (formData: FormData) => Promise<SaveResult>> = {
  reading: saveReadingEntry,
  dose: saveDoseEntry,
  event: saveEventEntry,
};
