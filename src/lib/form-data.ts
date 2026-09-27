/**
 * Small helpers shared by the server actions: reading form fields, parsing numbers,
 * and turning a datetime-local value into an instant.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}

export function text(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

/** A number, null when the field is empty, or "invalid" when it is not a number. */
export function optionalNumber(formData: FormData, name: string): number | null | "invalid" {
  const raw = text(formData, name).replace(/,/g, "");
  if (raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : "invalid";
}

/** The string fields, to hand back to a form after a failed submit. */
export function formFields(formData: FormData): Record<string, string> {
  return Object.fromEntries(
    [...formData.entries()].filter(([, v]) => typeof v === "string").map(([k, v]) => [k, v as string]),
  );
}

export type InstantResult = { ok: true; iso: string | null } | { ok: false; error: string };

/**
 * A datetime-local value ("2026-09-27T08:30") carries no zone. The form sends the
 * browser's getTimezoneOffset() alongside it, so local + offset = UTC. Empty means
 * "now" (null). Times more than an hour ahead are refused.
 */
export function instantFromLocal(value: string, offsetMinutes: number, now = Date.now()): InstantResult {
  if (!value) return { ok: true, iso: null };
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)) {
    return { ok: false, error: "The date and time are not valid." };
  }
  const withSeconds = value.length === 16 ? `${value}:00` : value;
  const local = new Date(`${withSeconds}Z`);
  if (Number.isNaN(local.getTime())) return { ok: false, error: "The date and time are not valid." };
  const offset = Number.isFinite(offsetMinutes) && Math.abs(offsetMinutes) <= 14 * 60 ? offsetMinutes : 0;
  const instant = new Date(local.getTime() + offset * 60_000);
  if (instant.getTime() > now + 60 * 60_000) return { ok: false, error: "That time is in the future." };
  return { ok: true, iso: instant.toISOString() };
}
