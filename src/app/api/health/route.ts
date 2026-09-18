import { publicEnv, serverEnv } from "@/lib/env";

/**
 * Liveness plus configuration check. Reports whether the Supabase variables are
 * present and whether the project answers with the publishable key. Never returns
 * a value, only yes/no, so it is safe to leave public.
 */
export async function GET() {
  const url = publicEnv.supabaseUrl();
  const publishableKey = publicEnv.supabasePublishableKey();
  const secretKey = serverEnv.supabaseSecretKey();

  let reachable: boolean | null = null;
  if (url && publishableKey) {
    try {
      const response = await fetch(`${url}/auth/v1/health`, {
        headers: { apikey: publishableKey },
        signal: AbortSignal.timeout(4000),
        cache: "no-store",
      });
      reachable = response.ok;
    } catch {
      reachable = false;
    }
  }

  return Response.json({
    ok: true,
    service: "tuffo",
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
    time: new Date().toISOString(),
    supabase: {
      url: Boolean(url),
      publishableKey: Boolean(publishableKey),
      secretKey: Boolean(secretKey),
      reachable,
    },
    waitlist: Boolean(serverEnv.waitlistWebhookUrl()),
  });
}
