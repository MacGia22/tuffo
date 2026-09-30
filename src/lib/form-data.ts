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

export function isTimeZone(value: string): boolean {
  if (!value) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** Milliseconds the zone's wall clock is ahead of UTC at that instant. */
function zoneOffsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const wall = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return wall - Math.floor(utcMs / 1000) * 1000;
}

/** An instant as a datetime-local value on the wall clock of a time zone: "2026-09-27T08:30". */
export function localInZone(iso: string, timeZone: string): string {
  const ms = Date.parse(iso);
  return new Date(ms + zoneOffsetMs(ms, timeZone)).toISOString().slice(0, 16);
}

/**
 * Like instantFromLocal, but the value is a wall-clock time in a named zone (the
 * pool's), so an edit reads the time the way the form showed it. Empty is null.
 */
export function instantInZone(value: string, timeZone: string, now = Date.now()): InstantResult {
  if (!value) return { ok: true, iso: null };
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)) {
    return { ok: false, error: "The date and time are not valid." };
  }
  const wall = Date.parse(`${value.length === 16 ? `${value}:00` : value}Z`);
  if (Number.isNaN(wall)) return { ok: false, error: "The date and time are not valid." };
  // Two passes settle the offset across a daylight-saving change.
  let instant = wall - zoneOffsetMs(wall, timeZone);
  instant = wall - zoneOffsetMs(instant, timeZone);
  if (instant > now + 60 * 60_000) return { ok: false, error: "That time is in the future." };
  return { ok: true, iso: new Date(instant).toISOString() };
}

/**
 * The time a log form was sent with. Edit forms send the pool's time zone and the value
 * they were opened with; an unchanged value keeps the stored instant (`keep`). New
 * entries use the browser's offset, and empty means now (null).
 */
export function whenFromForm(formData: FormData, field: string): InstantResult | { ok: true; keep: true } {
  const value = text(formData, field);
  const timeZone = text(formData, "time_zone");
  if (timeZone && isTimeZone(timeZone)) {
    if (!value || value === text(formData, `${field}_original`)) return { ok: true, keep: true };
    return instantInZone(value, timeZone);
  }
  return instantFromLocal(value, Number(text(formData, "tz_offset") || "0"));
}
