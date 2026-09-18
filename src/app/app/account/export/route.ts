import { getCurrentUser } from "@/lib/auth/user";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Everything Tuffo holds about the signed-in user, as one JSON file. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in first.", { status: 401 });

  const supabase = await createSupabaseServerClient();
  const [profile, pools, readings, doses, events] = await Promise.all([
    supabase.from("profiles").select("display_name, locale, units, consent_marketing_at, created_at").maybeSingle(),
    supabase.from("pools").select("*").order("created_at"),
    supabase.from("readings").select("*").order("taken_at"),
    supabase.from("doses").select("*").order("added_at"),
    supabase.from("events").select("*").order("occurred_at"),
  ]);

  const body = {
    exported_at: new Date().toISOString(),
    format: "tuffo-export/1",
    account: { id: user.id, email: user.email, created_at: user.created_at },
    profile: profile.data,
    pools: pools.data ?? [],
    readings: readings.data ?? [],
    doses: doses.data ?? [],
    events: events.data ?? [],
    units_note: "Volumes in liters, temperatures in °C, doses in grams or milliliters; locations are 0.05° weather cells.",
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
