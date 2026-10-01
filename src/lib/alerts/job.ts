import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { canSeePlan } from "@/lib/entitlements";
import { publicEnv, serverEnv } from "@/lib/env";
import type { Units } from "@/lib/format";
import { parseStoredPlan, type StoredPlan } from "@/lib/plan/stored";
import { dueText } from "@/lib/maintenance";
import { loadPoolMaintenance } from "@/lib/maintenance-data";
import { dueAlerts, type PoolAlertSettings, type PoolAlertState, type SentAlert } from "./decide";
import { renderAlertEmail } from "./email";
import { sendEmail } from "./send";
import { unsubscribeToken } from "./token";

/**
 * The daily alerts job (Vercel cron, about 11:30 UTC). Production only, and only with
 * RESEND_API_KEY and CRON_SECRET (which signs the unsubscribe links). For each person
 * with an alert switched on: work out what is due, claim today's one email in
 * alert_emails (its primary key refuses a second), send, then log each alert. Stops at
 * ALERT_DAILY_LIMIT emails a day. Fails open: a problem is logged with [alerts] and the
 * job goes on with the next person.
 */

const DAY_MS = 86_400_000;
const DEFAULT_DAILY_LIMIT = 1000;
/** Alert history kept for deciding what is due, and in the export. */
export const ALERT_LOG_DAYS = 90;

export interface AlertJobResult {
  skipped?: string;
  people: number;
  sent: number;
  failed: number;
  limitReached: boolean;
}

interface SettingsRow {
  pool_id: string;
  algae: boolean;
  test_reminder: boolean;
  test_after_days: number;
  weekly: boolean;
  maintenance?: boolean;
  pools: { name: string; owner_id: string } | null;
}

export function dailyLimit(): number {
  const value = Number(serverEnv.alertDailyLimit());
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_DAILY_LIMIT;
}

export async function runAlertsJob(admin: SupabaseClient, now = Date.now()): Promise<AlertJobResult> {
  const result: AlertJobResult = { people: 0, sent: 0, failed: 0, limitReached: false };
  if (process.env.VERCEL_ENV !== "production") return { ...result, skipped: "not production" };
  const apiKey = serverEnv.resendApiKey();
  const secret = serverEnv.cronSecret();
  if (!apiKey || !secret) return { ...result, skipped: "RESEND_API_KEY or CRON_SECRET not set" };

  const today = new Date(now).toISOString().slice(0, 10);
  const siteUrl = publicEnv.siteUrl();
  const planAllowed = await canSeePlan();

  const columns = "pool_id, algae, test_reminder, test_after_days, weekly, pools(name, owner_id)";
  let { data: settings, error } = await admin
    .from("alert_settings")
    .select(`${columns}, maintenance`)
    .or("algae.eq.true,test_reminder.eq.true,weekly.eq.true,maintenance.eq.true")
    .returns<SettingsRow[]>();
  if (error && /maintenance/.test(error.message)) {
    // Before the maintenance migration lands.
    ({ data: settings, error } = await admin
      .from("alert_settings")
      .select(columns)
      .or("algae.eq.true,test_reminder.eq.true,weekly.eq.true")
      .returns<SettingsRow[]>());
  }
  if (error) throw new Error(`alert_settings: ${error.message}`);

  const byOwner = new Map<string, PoolAlertSettings[]>();
  for (const row of settings ?? []) {
    if (!row.pools) continue;
    const list = byOwner.get(row.pools.owner_id) ?? [];
    list.push({
      poolId: row.pool_id,
      poolName: row.pools.name,
      algae: row.algae && planAllowed,
      testReminder: row.test_reminder,
      testAfterDays: row.test_after_days,
      weekly: row.weekly && planAllowed,
      maintenance: row.maintenance === true,
    });
    byOwner.set(row.pools.owner_id, list);
  }
  result.people = byOwner.size;

  const { count: sentToday } = await admin
    .from("alert_emails")
    .select("user_id", { count: "exact", head: true })
    .eq("sent_on", today);
  let budget = dailyLimit() - (sentToday ?? 0);

  for (const [userId, pools] of byOwner) {
    if (budget <= 0) {
      result.limitReached = true;
      console.error(`[alerts] daily limit of ${dailyLimit()} emails reached; the rest wait for tomorrow`);
      break;
    }
    try {
      const poolIds = pools.map((p) => p.poolId);
      const since = new Date(now - 14 * DAY_MS).toISOString().slice(0, 10);
      const [{ data: sentRows }, { data: todayRow }, { data: planRows }, lastTests] = await Promise.all([
        admin.from("alert_log").select("pool_id, kind, sent_on").eq("user_id", userId).gte("sent_on", since),
        admin.from("alert_emails").select("sent_on").eq("user_id", userId).eq("sent_on", today).maybeSingle(),
        admin.from("plans").select("pool_id, computed_at, version, summary, days").in("pool_id", poolIds),
        Promise.all(
          poolIds.map(async (poolId) => {
            const { data } = await admin
              .from("readings")
              .select("taken_at")
              .eq("pool_id", poolId)
              .order("taken_at", { ascending: false })
              .limit(1)
              .maybeSingle<{ taken_at: string }>();
            return [poolId, data?.taken_at ?? null] as const;
          }),
        ),
      ]);

      const plans: Record<string, StoredPlan | undefined> = {};
      for (const row of planRows ?? []) {
        const parsed = parseStoredPlan(row as { computed_at: string; version: number; summary: unknown; days: unknown });
        if (parsed) plans[(row as { pool_id: string }).pool_id] = parsed;
      }
      // Upkeep due today or overdue, for pools with maintenance reminders on; fails open.
      const maintenanceDue = new Map<string, string[]>();
      for (const p of pools.filter((x) => x.maintenance)) {
        const m = await loadPoolMaintenance(admin, p.poolId, { now });
        const due = (m?.statuses ?? []).filter((t) => t.state === "overdue" || t.state === "due");
        maintenanceDue.set(p.poolId, due.map((t) => `${t.task.label} (${dueText(t)})`));
      }
      const state: PoolAlertState[] = lastTests.map(([poolId, lastTestAt]) => {
        const plan = plans[poolId];
        return {
          poolId,
          lastTestAt,
          maintenanceDue: maintenanceDue.get(poolId) ?? [],
          plan: plan
            ? { fcStart: plan.summary.fcStart, fcMin: plan.summary.fc.min, riskDates: plan.days.filter((d) => d.algaeRisk).map((d) => d.date) }
            : null,
        };
      });
      const sent: SentAlert[] = [
        ...(sentRows ?? []).map((r) => ({ poolId: r.pool_id as string | null, kind: r.kind as SentAlert["kind"], sentOn: r.sent_on as string })),
        ...(todayRow ? [{ poolId: null, kind: "weekly" as const, sentOn: today }] : []),
      ];

      const due = dueAlerts({ today, now, settings: pools, state, sent });
      if (due.length === 0) continue;

      // Claim today's email; a second run the same day stops here.
      const { error: claimError } = await admin.from("alert_emails").insert({ user_id: userId, sent_on: today, alerts: due.length });
      if (claimError) continue;

      const [{ data: user }, { data: profile }] = await Promise.all([
        admin.auth.admin.getUserById(userId),
        admin.from("profiles").select("units").eq("id", userId).maybeSingle<{ units: Units }>(),
      ]);
      const to = user?.user?.email;
      if (!to) {
        await admin.from("alert_emails").delete().eq("user_id", userId).eq("sent_on", today);
        continue;
      }

      const unsubscribeUrl = `${siteUrl}/alerts/unsubscribe?t=${unsubscribeToken(userId, null, secret)}`;
      const email = renderAlertEmail(due, { units: profile?.units ?? "us", siteUrl, plans, unsubscribeUrl });
      try {
        await sendEmail({
          apiKey,
          to,
          email,
          unsubscribeUrl: `${siteUrl}/api/alerts/unsubscribe?t=${unsubscribeToken(userId, null, secret)}`,
        });
      } catch (err) {
        // Give the day back; tomorrow's run tries again.
        await admin.from("alert_emails").delete().eq("user_id", userId).eq("sent_on", today);
        throw err;
      }
      budget -= 1;
      result.sent += 1;
      await admin.from("alert_log").insert(due.map((a) => ({ user_id: userId, pool_id: a.poolId, kind: a.kind, sent_on: today })));
    } catch (err) {
      result.failed += 1;
      console.error(`[alerts] ${err instanceof Error ? err.message : String(err)}`.slice(0, 300));
    }
  }

  // Keep 90 days of history.
  const cutoff = new Date(now - ALERT_LOG_DAYS * DAY_MS).toISOString().slice(0, 10);
  await admin.from("alert_log").delete().lt("sent_on", cutoff);
  await admin.from("alert_emails").delete().lt("sent_on", cutoff);
  return result;
}

/** Switches alerts off after a signed unsubscribe link: one pool, or every pool of the person. */
export async function unsubscribe(admin: SupabaseClient, userId: string, poolId: string | null): Promise<boolean> {
  const { data: pools, error } = await admin.from("pools").select("id").eq("owner_id", userId).returns<{ id: string }[]>();
  if (error) throw new Error(`pools: ${error.message}`);
  const ids = (pools ?? []).map((p) => p.id).filter((id) => poolId === null || id === poolId);
  if (ids.length === 0) return false;
  const { error: uErr } = await admin
    .from("alert_settings")
    .update({ algae: false, test_reminder: false, weekly: false, updated_at: new Date().toISOString() })
    .in("pool_id", ids);
  if (uErr) throw new Error(`alert_settings: ${uErr.message}`);
  // Separate, so a missing column (before its migration) cannot block the rest.
  const { error: mErr } = await admin.from("alert_settings").update({ maintenance: false }).in("pool_id", ids);
  if (mErr) console.error(`[alerts] unsubscribe maintenance: ${mErr.message}`);
  return true;
}
