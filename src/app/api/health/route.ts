import { publicEnv, serverEnv } from "@/lib/env";

/**
 * Liveness plus configuration check. Reports whether the Supabase variables are
 * present, what shape they have and whether the project answers with the publishable
 * key. Never returns a value, only yes/no and coarse shapes, so it is safe to leave
 * public.
 */

type UrlShape =
  | "missing"
  | "supabase-co"
  | "custom-domain"
  | "dashboard-url"
  | "not-https"
  | "contains-whitespace"
  | "contains-equals";

type KeyShape =
  | "missing"
  | "publishable"
  | "secret"
  | "legacy-anon"
  | "legacy-service_role"
  | "legacy-jwt"
  | "unknown";

function describeUrl(url: string | undefined): UrlShape {
  if (!url) return "missing";
  if (/\s/.test(url)) return "contains-whitespace";
  if (url.includes("=")) return "contains-equals";
  if (!url.startsWith("https://")) return "not-https";
  if (url.includes("supabase.com/dashboard")) return "dashboard-url";
  if (/^https:\/\/[a-z]{20}\.supabase\.(co|in)$/.test(url)) return "supabase-co";
  return "custom-domain";
}

function legacyRole(jwt: string): KeyShape {
  try {
    const payload = jwt.split(".")[1] ?? "";
    const json = Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const role = (JSON.parse(json) as { role?: unknown }).role;
    if (role === "anon") return "legacy-anon";
    if (role === "service_role") return "legacy-service_role";
  } catch {
    // fall through
  }
  return "legacy-jwt";
}

function describeKey(key: string | undefined): KeyShape {
  if (!key) return "missing";
  if (key.startsWith("sb_publishable_")) return "publishable";
  if (key.startsWith("sb_secret_")) return "secret";
  if (key.startsWith("eyJ")) return legacyRole(key);
  return "unknown";
}

/** HTTP status of a GET with the given key, or the error name when the call fails. */
async function probe(url: string, apikey: string): Promise<number | string> {
  try {
    const response = await fetch(url, {
      headers: { apikey },
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    return response.status;
  } catch (error) {
    return error instanceof Error ? error.name : "error";
  }
}

export async function GET() {
  const url = publicEnv.supabaseUrl();
  const publishableKey = publicEnv.supabasePublishableKey();
  const secretKey = serverEnv.supabaseSecretKey();

  let auth: number | string | null = null;
  let rest: number | string | null = null;
  if (url && publishableKey) {
    [auth, rest] = await Promise.all([
      probe(`${url}/auth/v1/health`, publishableKey),
      probe(`${url}/rest/v1/`, publishableKey),
    ]);
  }
  const reachable = auth === null ? null : auth === 200;

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
      shapes: {
        url: describeUrl(url),
        publishableKey: describeKey(publishableKey),
        secretKey: describeKey(secretKey),
      },
      probes: { auth, rest },
    },
    waitlist: Boolean(serverEnv.waitlistWebhookUrl()),
  });
}
