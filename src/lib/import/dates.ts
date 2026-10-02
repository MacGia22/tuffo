/**
 * Dates as other apps write them in CSV exports. A value with its own offset ("Z",
 * "+02:00") is an instant; anything else is a wall-clock time at the pool, read later in
 * the pool's time zone. A date without a time is taken as noon.
 */

export type DateOrder = "mdy" | "dmy";

export type ParsedDate = { instant: string } | { wall: string };

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function wall(y: number, mo: number, d: number, h: number, mi: number): ParsedDate | null {
  if (y < 100) y += 2000;
  if (y < 1990 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (check.getUTCMonth() !== mo - 1) return null; // 31 June and the like
  return { wall: `${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}` };
}

/** "8:30", "8:30:15 PM", "20:30", "" → hours and minutes in 24-hour time. */
function parseTime(raw: string): { h: number; mi: number } | null {
  const t = raw.trim();
  if (!t) return { h: 12, mi: 0 };
  const m = t.match(/^(\d{1,2})(?::(\d{2}))?(?::\d{2}(?:\.\d+)?)?\s*([ap])\.?m?\.?$/i) ?? t.match(/^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const mi = Number(m[2] ?? 0);
  const ampm = m[3]?.toLowerCase();
  if (ampm) {
    if (h < 1 || h > 12) return null;
    if (ampm === "p" && h !== 12) h += 12;
    if (ampm === "a" && h === 12) h = 0;
  }
  return { h, mi };
}

export function parseImportDate(raw: string, order: DateOrder = "mdy"): ParsedDate | null {
  const value = raw.trim().replace(/\s+/g, " ");
  if (!value) return null;

  // Pool Math: an ISO date with a 12-hour clock, "2026-09-26 09:47:03 AM".
  const isoClock = value.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?\s*[ap]\.?m?\.?)$/i);
  if (isoClock) {
    const [, y, mo, d, time] = isoClock;
    const t = parseTime(time);
    return t ? wall(Number(y), Number(mo), Number(d), t.h, t.mi) : null;
  }

  // ISO 8601, with or without an offset.
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i);
  if (iso) {
    const [, y, mo, d, h = "12", mi = "00", zone] = iso;
    const parsed = wall(Number(y), Number(mo), Number(d), Number(h), Number(mi));
    if (!parsed || !("wall" in parsed)) return null;
    if (!zone) return parsed;
    const offset = zone.toUpperCase() === "Z" ? "Z" : zone.replace(/^([+-]\d{2})(\d{2})$/, "$1:$2");
    const ms = Date.parse(`${parsed.wall}:00${offset}`);
    return Number.isNaN(ms) ? null : { instant: new Date(ms).toISOString() };
  }

  // 9/27/2026 8:30 AM, 27.09.2026 20:30, 9-27-26
  const numeric = value.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4}),?(?:\s+(.*))?$/);
  if (numeric) {
    const [, a, b, y, time = ""] = numeric;
    const t = parseTime(time);
    if (!t) return null;
    const [mo, d] = order === "mdy" ? [Number(a), Number(b)] : [Number(b), Number(a)];
    return wall(Number(y), mo, d, t.h, t.mi);
  }

  // Sep 27, 2026 8:30 AM  /  27 Sep 2026 20:30
  const named =
    value.match(/^([a-z]{3,9})\.? (\d{1,2}),? (\d{4}),?(?: (?:at )?(.*))?$/i) ??
    value.match(/^(\d{1,2}) ([a-z]{3,9})\.? (\d{4}),?(?: (?:at )?(.*))?$/i);
  if (named) {
    const monthFirst = /^[a-z]/i.test(named[1]);
    // "sept" is a key; otherwise the first three letters ("oct", "october" → oct).
    const monthName = (monthFirst ? named[1] : named[2]).toLowerCase();
    const mo = MONTHS[monthName.slice(0, 4)] ?? MONTHS[monthName.slice(0, 3)];
    const d = Number(monthFirst ? named[2] : named[1]);
    const t = parseTime(named[4] ?? "");
    if (!mo || !t) return null;
    return wall(Number(named[3]), mo, d, t.h, t.mi);
  }
  return null;
}

/**
 * Whether dates in a column read day-first: yes when some first part is over 12 and
 * no second part is, as in 27/09/2026. Otherwise month-first (US).
 */
export function guessDateOrder(values: string[]): DateOrder {
  let firstOver12 = false;
  let secondOver12 = false;
  for (const v of values) {
    const m = v.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-]/);
    if (!m) continue;
    if (Number(m[1]) > 12) firstOver12 = true;
    if (Number(m[2]) > 12) secondOver12 = true;
  }
  return firstOver12 && !secondOver12 ? "dmy" : "mdy";
}
