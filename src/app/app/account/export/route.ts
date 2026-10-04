import { getCurrentUser } from "@/lib/auth/user";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Everything Tuffo holds about the signed-in user, as one JSON file. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in first.", { status: 401 });

  const supabase = await createSupabaseServerClient();
  const [profile, pools, readings, doses, events, scans, feedback, plans, alertSettings, alertLog, pumpSchedules, poolRain, poolEquipment, poolMaintenance, poolPressure, scanReports] = await Promise.all([
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
    supabase.from("alert_settings").select("*"),
    supabase.from("alert_log").select("pool_id, kind, sent_on").order("sent_on"),
    supabase.from("pump_schedules").select("pool_id, effective_from, segments, cell_hours, source").order("effective_from"),
    supabase.from("pool_rain").select("pool_id, date, rain_mm, updated_at").order("date"),
    supabase.from("pool_equipment").select("pool_id, kind, model, details, installed_on, removed_on").order("installed_on"),
    supabase.from("pool_maintenance").select("pool_id, task, done_on, created_at").order("done_on"),
    supabase.from("pool_pressure").select("pool_id, read_on, kpa, clean, created_at").order("read_on"),
    // Misread reports: the numbers read, the corrections and the note; never the image bytes.
    supabase
      .from("scan_reports")
      .select("id, created_at, kind, source, model, prompt_version, read, corrected, note, photo_path, photo_consent_at, consent_version, photo_delete_after, status")
      .order("created_at"),
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
    equipment: poolEquipment.data ?? [],
    maintenance_done: poolMaintenance.data ?? [],
    filter_pressure: poolPressure.data ?? [],
    misread_reports: scanReports.data ?? [],
    misread_reports_note:
      "Photos you shared with a report are not in this file. Where photo_path is set, the photo is still stored: view or delete it on the Account page, under Shared scan photos.",
    units_note: "Volumes in liters, temperatures in °C, rain in millimeters, filter pressure in kPa, doses in grams or milliliters; locations are 0.03° weather cells (0.05° for pools not moved since September 2026).",
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
