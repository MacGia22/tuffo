import { publicEnv, serverEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Liveness plus configuration check. Reports whether the Supabase variables are
 * present, what shape they have and whether the project answers with the publishable
 * key. Never returns a value, only yes/no and coarse shapes, so it is safe to leave
 * public.
 */

type UrlShape =
  | "missing"
  | "supabase-co"
  | "supabase-co-with-path"
  | "supabase-host-without-scheme"
  | "host-without-scheme"
  | "project-ref-only"
  | "looks-like-a-jwt-key"
  | "looks-like-a-publishable-key"
  | "looks-like-a-secret-key"
  | "postgres-connection-string"
  | "dashboard-url"
  | "http-not-https"
  | "unexpected-scheme"
  | "contains-whitespace"
  | "contains-equals"
  | "other";

interface UrlReport {
  shape: UrlShape;
  /** Character count and scheme are safe to show and narrow down what was pasted. */
  length?: number;
  scheme?: string | null;
  endsWithSupabaseHost?: boolean;
}

type KeyShape =
  | "missing"
  | "publishable"
  | "secret"
  | "legacy-anon"
  | "legacy-service_role"
  | "legacy-jwt"
  | "unknown";

/** Shape of the variable as set, before normalisation. */
function describeUrl(raw: string | undefined): UrlReport {
  if (!raw) return { shape: "missing" };
  const scheme = raw.match(/^([a-z][a-z0-9+.-]*):\/\//i)?.[1]?.toLowerCase() ?? null;
  const host = /^(https?:\/\/)?[a-z]{20}\.supabase\.(co|in)(\/|$)/;

  let shape: UrlShape;
  if (/\s/.test(raw)) shape = "contains-whitespace";
  else if (raw.includes("=")) shape = "contains-equals";
  else if (raw.startsWith("eyJ")) shape = "looks-like-a-jwt-key";
  else if (raw.startsWith("sb_publishable_")) shape = "looks-like-a-publishable-key";
  else if (raw.startsWith("sb_secret_")) shape = "looks-like-a-secret-key";
  else if (/^[a-z]{20}$/.test(raw)) shape = "project-ref-only";
  else if (scheme === "postgres" || scheme === "postgresql") shape = "postgres-connection-string";
  else if (raw.includes("supabase.com/dashboard")) shape = "dashboard-url";
  else if (scheme === "http") shape = "http-not-https";
  else if (scheme && scheme !== "https") shape = "unexpected-scheme";
  else if (!scheme && host.test(raw)) shape = "supabase-host-without-scheme";
  else if (!scheme) shape = "host-without-scheme";
  else if (/^https:\/\/[a-z]{20}\.supabase\.(co|in)\/?$/.test(raw)) shape = "supabase-co";
  else if (host.test(raw)) shape = "supabase-co-with-path";
  else shape = "other";

  return {
    shape,
    length: raw.length,
    scheme,
    endsWithSupabaseHost: /\.supabase\.(co|in)\/?$/.test(raw),
  };
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

/**
 * HTTP status of a GET with the given key, or "<ErrorName>:<code>" when the call
 * fails. Only the error name and the cause's code are reported: messages can
 * contain the host name.
 */
async function probe(url: string, apikey: string): Promise<number | string> {
  try {
    // As supabase-js does: the gateway reads apikey; a legacy JWT key is also the bearer,
    // a new-style publishable key never is.
    const headers: Record<string, string> = { apikey };
    if (apikey.startsWith("eyJ")) headers.Authorization = `Bearer ${apikey}`;
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    if (response.ok) return response.status;
    // The gateway's own error messages ("Invalid API key") are short and carry no secrets.
    const text = (await response.text()).replace(/\s+/g, " ").slice(0, 80);
    return `${response.status} ${text}`;
  } catch (error) {
    if (!(error instanceof Error)) return "error";
    const cause = error.cause as { code?: unknown } | undefined;
    const code = typeof cause?.code === "string" ? cause.code : null;
    return code ? `${error.name}:${code}` : error.name;
  }
}

const TABLES = ["profiles", "weather_cells", "weather_daily", "weather_forecast", "pools", "readings", "doses", "events", "pool_models"];

/** Which tables exist, checked with the secret key (a head request, no rows). */
async function schemaPresent(): Promise<{ tables: Record<string, boolean>; error: string | null } | null> {
  try {
    const admin = createSupabaseAdminClient();
    let firstError: string | null = null;
    const checks = await Promise.all(
      TABLES.map(async (table) => {
        const { error } = await admin.from(table).select("*", { head: true, count: "exact" }).limit(0);
        if (error && !firstError) firstError = `${error.code ?? ""} ${error.message}`.trim().slice(0, 120);
        return [table, !error] as const;
      }),
    );
    return { tables: Object.fromEntries(checks), error: firstError };
  } catch (error) {
    return { tables: {}, error: error instanceof Error ? error.name : "error" };
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
      // A real table, so the answer distinguishes a bad key (401) from a missing schema (404).
      probe(`${url}/rest/v1/pools?select=id&limit=1`, publishableKey),
    ]);
  }
  const reachable = auth === null ? null : auth === 200;
  const schema = reachable && secretKey ? await schemaPresent() : null;

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
        url: describeUrl(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || undefined),
        publishableKey: describeKey(publishableKey),
        secretKey: describeKey(secretKey),
      },
      probes: { auth, rest },
      schema,
    },
    cron: Boolean(serverEnv.cronSecret()),
    waitlist: Boolean(serverEnv.waitlistWebhookUrl()),
  });
}
