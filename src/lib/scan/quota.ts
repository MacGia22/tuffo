import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Limits on photo scanning, so one account (or a script) cannot run up the vision
 * bill. Three checks, cheapest to explain first:
 *
 *   monthly   successful scans per user per calendar month (UTC)
 *   burst     attempts per user within a few minutes
 *   daily     successful scans across everyone per UTC day (a spending backstop;
 *             the Anthropic console's monthly limit is the hard one)
 *
 * Counts come from the `scans` table. If that table is missing (migration not
 * applied yet) or a count fails, scanning stays open and the failure is logged:
 * a quota must never be the reason the feature breaks.
 */

export interface ScanLimits {
  monthly: number;
  burst: number;
  burstMinutes: number;
  dailyGlobal: number;
}

export const DEFAULT_LIMITS: ScanLimits = { monthly: 30, burst: 6, burstMinutes: 10, dailyGlobal: 300 };

function positiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw?.trim());
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export function scanLimits(env: Record<string, string | undefined> = process.env): ScanLimits {
  return {
    monthly: positiveInt(env.SCAN_MONTHLY_LIMIT, DEFAULT_LIMITS.monthly),
    burst: DEFAULT_LIMITS.burst,
    burstMinutes: DEFAULT_LIMITS.burstMinutes,
    dailyGlobal: positiveInt(env.SCAN_DAILY_GLOBAL_LIMIT, DEFAULT_LIMITS.dailyGlobal),
  };
}

export function monthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function nextMonthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

export function dayStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** "October 1": when this month's allowance starts again. */
export function resetLabel(now: Date): string {
  return nextMonthStart(now).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
}

export interface ScanCounts {
  /** Successful scans by this user this month. */
  month: number;
  /** Attempts by this user within the burst window. */
  recent: number;
  /** Successful scans by everyone today. */
  today: number;
}

export type QuotaDecision =
  | { allowed: true; remaining: number }
  | { allowed: false; reason: "monthly" | "burst" | "daily"; remaining: number; message: string };

export function decide(counts: ScanCounts, limits: ScanLimits, now: Date): QuotaDecision {
  const remaining = Math.max(0, limits.monthly - counts.month);
  if (remaining === 0) {
    return {
      allowed: false,
      reason: "monthly",
      remaining,
      message: `You have used this month's ${limits.monthly} scans. Type the numbers for now; scans start again on ${resetLabel(now)}.`,
    };
  }
  if (counts.recent >= limits.burst) {
    return {
      allowed: false,
      reason: "burst",
      remaining,
      message: "That is a lot of photos in a few minutes. Wait a little and try again, or type the numbers.",
    };
  }
  if (counts.today >= limits.dailyGlobal) {
    return {
      allowed: false,
      reason: "daily",
      remaining,
      message: "Photo scanning has hit today's limit for everyone. Type the numbers for now; it opens again tomorrow.",
    };
  }
  return { allowed: true, remaining };
}

type CountResult = { count: number | null; error: { code?: string; message: string } | null };

function countOf(result: CountResult, what: string): number | null {
  if (result.error) {
    console.error(`[scan-quota] ${what}: ${`${result.error.code ?? ""} ${result.error.message}`.trim().slice(0, 160)}`);
    return null;
  }
  return result.count ?? 0;
}

/**
 * A user's successful scans this month, or null when the count is unavailable. With
 * the signed-in user's own client, pass `userId` null: row-level security already
 * limits the count to their scans.
 */
export async function monthlyUsed(db: SupabaseClient, userId: string | null, now: Date): Promise<number | null> {
  let query = db.from("scans").select("id", { count: "exact", head: true });
  if (userId) query = query.eq("user_id", userId);
  const result = await query.eq("ok", true).gte("created_at", monthStart(now).toISOString());
  return countOf(result, "monthly count");
}

/**
 * All three counts, with the service client (the daily total spans every user).
 * Null when any count is unavailable, which callers treat as "allow".
 */
export async function scanCounts(
  admin: SupabaseClient,
  userId: string,
  now: Date,
  limits: ScanLimits,
): Promise<ScanCounts | null> {
  const since = new Date(now.getTime() - limits.burstMinutes * 60_000).toISOString();
  const [month, recent, today] = await Promise.all([
    monthlyUsed(admin, userId, now),
    admin
      .from("scans")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", since)
      .then((r) => countOf(r, "burst count")),
    admin
      .from("scans")
      .select("id", { count: "exact", head: true })
      .eq("ok", true)
      .gte("created_at", dayStart(now).toISOString())
      .then((r) => countOf(r, "daily count")),
  ]);
  if (month === null || recent === null || today === null) return null;
  return { month, recent, today };
}

/** Records an attempt before the model is called; returns its id, or null if it could not be written. */
export async function startScan(admin: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await admin.from("scans").insert({ user_id: userId }).select("id").single<{ id: string }>();
  if (error) {
    console.error(`[scan-quota] record: ${`${error.code ?? ""} ${error.message}`.trim().slice(0, 160)}`);
    return null;
  }
  return data.id;
}

/** Marks an attempt as a successful scan (the one that counts against the allowance). */
export async function finishScan(
  admin: SupabaseClient,
  id: string,
  details: { source: string; confidence: string; model: string; inputTokens: number; outputTokens: number },
): Promise<void> {
  const { error } = await admin
    .from("scans")
    .update({
      ok: true,
      source: details.source.slice(0, 40),
      confidence: details.confidence,
      model: details.model.slice(0, 80),
      input_tokens: details.inputTokens,
      output_tokens: details.outputTokens,
    })
    .eq("id", id);
  if (error) console.error(`[scan-quota] finish: ${`${error.code ?? ""} ${error.message}`.trim().slice(0, 160)}`);
}

/** How long the scan log is kept; the privacy notice promises this. */
export const SCAN_LOG_DAYS = 365;

/** Deletes scan log rows older than SCAN_LOG_DAYS. Never throws; false when it could not run. */
export async function pruneScanLog(admin: SupabaseClient, now: Date): Promise<boolean> {
  try {
    const cutoff = new Date(now.getTime() - SCAN_LOG_DAYS * 86_400_000).toISOString();
    const { error } = await admin.from("scans").delete().lt("created_at", cutoff);
    if (error) {
      console.error(`[scan-quota] prune: ${`${error.code ?? ""} ${error.message}`.trim().slice(0, 160)}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error(`[scan-quota] prune: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}
