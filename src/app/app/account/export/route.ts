import { getCurrentUser } from "@/lib/auth/user";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Everything Tuffo holds about the signed-in user, as one JSON file. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in first.", { status: 401 });

  const supabase = await createSupabaseServerClient();
  const [profile, pools, readings, doses, events, scans, feedback, plans, alertSettings, alertLog, pumpSchedules, poolRain] = await Promise.all([
    supabase.from("profiles").select("display_name, locale, units, consent_marketing_at, created_at").maybeSingle(),
    supabase.from("pools").select("*").order("created_at"),
    supabase.from("readings").select("*").order("taken_at"),
    supabase.from("doses").select("*").order("added_at"),
    supabase.from("events").select("*").order("occurred_at"),
    // The photo-scan log: when, whether it worked, tokens used. Photos are never stored.
    supabase.from("scans").select("created_at, ok, source, confidence, model").order("created_at"),
    supabase
      .from("feedback")
      .select("id, created_at, kind, message, page, app_version, contact_ok, status")
      .order("created_at"),
    // The 7-day plans Tuffo worked out: advice per day, no model parameters.
    supabase.from("plans").select("pool_id, computed_at, summary, days"),
    supabase.from("alert_settings").select("pool_id, algae, test_reminder, test_after_days, weekly, updated_at"),
    supabase.from("alert_log").select("pool_id, kind, sent_on").order("sent_on"),
    supabase.from("pump_schedules").select("pool_id, effective_from, segments, cell_hours, source").order("effective_from"),
    supabase.from("pool_rain").select("pool_id, date, rain_mm, updated_at").order("date"),
  ]);

  const body = {
    exported_at: new Date().toISOString(),
    format: "tuffo-export/1",
    account: {
      id: user.id,
      email: user.email,
      created_at: user.created_at,
      signup_source: (user.user_metadata?.signup_source as string | undefined) ?? null,
    },
    profile: profile.data,
    pools: pools.data ?? [],
    readings: readings.data ?? [],
    doses: doses.data ?? [],
    events: events.data ?? [],
    photo_scans: scans.data ?? [],
    feedback: feedback.data ?? [],
    plans: plans.data ?? [],
    alert_settings: alertSettings.data ?? [],
    alerts_sent: alertLog.data ?? [],
    pump_schedules: pumpSchedules.data ?? [],
    rain_at_pool: poolRain.data ?? [],
    units_note: "Volumes in liters, temperatures in °C, rain in millimeters, doses in grams or milliliters; locations are 0.05° weather cells.",
  };

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="tuffo-export-${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
