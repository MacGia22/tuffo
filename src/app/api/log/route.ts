import { getCurrentUser } from "@/lib/auth/user";
import { isUuid } from "@/lib/form-data";
import { SAVERS, type LogKind } from "@/lib/log/save";

export const dynamic = "force-dynamic";

const MAX_BODY = 20_000;

/**
 * POST { kind: "reading" | "dose" | "event", fields } — one entry the app queued while
 * offline, with the same fields its form sends plus `client_id`. Validates and stores it
 * like the form does. 200 when saved (or already saved: same client_id), 400 with a
 * reason when a value is refused, 401 when signed out and 503 when the database had a
 * problem (the app keeps it and retries both).
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return Response.json({ ok: false, error: "Send JSON." }, { status: 415 });
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY) return Response.json({ ok: false, error: "That entry is too large." }, { status: 413 });
  let body: { kind?: unknown; fields?: unknown };
  try {
    body = JSON.parse(raw) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "Send JSON." }, { status: 400 });
  }

  const kind = body.kind as LogKind;
  if (!(typeof kind === "string" && kind in SAVERS)) return Response.json({ ok: false, error: "Unknown kind of entry." }, { status: 400 });
  if (!body.fields || typeof body.fields !== "object") return Response.json({ ok: false, error: "No fields." }, { status: 400 });

  const formData = new FormData();
  for (const [key, value] of Object.entries(body.fields as Record<string, unknown>)) {
    if (typeof value === "string") formData.set(key, value);
  }
  // Only new entries travel through the queue, each with its device-made id.
  if (formData.get("id")) return Response.json({ ok: false, error: "Edits are not queued." }, { status: 400 });
  if (!isUuid(String(formData.get("client_id") ?? ""))) {
    return Response.json({ ok: false, error: "Missing entry id." }, { status: 400 });
  }

  const result = await SAVERS[kind](formData);
  if (!result.ok) return Response.json({ ok: false, error: result.error }, { status: result.transient ? 503 : 400 });
  return Response.json({ ok: true });
}
