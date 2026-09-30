import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCurrentUser } from "@/lib/auth/user";
import { serverEnv } from "@/lib/env";
import { SCAN_MEDIA_TYPES, type ScanMediaType } from "@/lib/scan/extract";
import { extractPumpSchedule } from "@/lib/scan/pump";
import { decide, finishScan, scanCounts, scanLimits, startScan } from "@/lib/scan/quota";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 6 * 1024 * 1024;

/**
 * POST multipart/form-data with an `image` part: a screenshot or photo of a pump's
 * schedule. Signed-in users only; counts as one scan of the monthly allowance. Returns
 * the runs read for review; the image itself is not kept.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!serverEnv.anthropicApiKey()) {
    return Response.json({ ok: false, error: "Photo scanning is not switched on yet." }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ ok: false, error: "Send the photo as multipart form data." }, { status: 400 });
  }
  const file = form.get("image");
  if (!(file instanceof File)) return Response.json({ ok: false, error: "No photo received." }, { status: 400 });
  if (file.size === 0 || file.size > MAX_BYTES) {
    return Response.json({ ok: false, error: "Photos up to 6 MB, please." }, { status: 413 });
  }
  const mediaType = file.type as ScanMediaType;
  if (!SCAN_MEDIA_TYPES.includes(mediaType)) {
    return Response.json({ ok: false, error: "Use a JPEG, PNG or WebP photo." }, { status: 415 });
  }

  // Allowance: checked and recorded with the service client. When the counts are
  // unavailable the scan goes ahead; the quota must never break the feature.
  const now = new Date();
  const limits = scanLimits();
  let admin: SupabaseClient | null = null;
  try {
    admin = createSupabaseAdminClient();
  } catch {
    console.error("[scan-quota] no service client; scanning without the allowance check");
  }
  const counts = admin ? await scanCounts(admin, user.id, now, limits) : null;
  const decision = counts ? decide(counts, limits, now) : null;
  if (decision && !decision.allowed) {
    return Response.json(
      { ok: false, error: decision.message, remaining: decision.remaining, limit: limits.monthly },
      { status: 429 },
    );
  }
  const scanId = admin ? await startScan(admin, user.id) : null;

  try {
    const result = await extractPumpSchedule({ bytes: Buffer.from(await file.arrayBuffer()), mediaType });
    if (admin && scanId) {
      await finishScan(admin, scanId, {
        source: "pump_schedule",
        confidence: result.confidence,
        model: result.usage.model,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
      });
    }
    const remaining = decision ? Math.max(0, decision.remaining - 1) : null;
    return Response.json({ ok: true, ...result, usage: undefined, remaining, limit: limits.monthly });
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      // Key, billing, model or rate-limit problems are ours, not the photo's; log them for the runtime logs.
      console.error(`[scan] api error ${error.status ?? "?"}: ${error.message.slice(0, 200)}`);
      const ours = error.status === 401 || error.status === 402 || error.status === 403 || error.status === 404;
      return Response.json(
        {
          ok: false,
          error: ours
            ? "Photo scanning is misconfigured on our side. Type the numbers for now; we are on it."
            : "The scanner is busy. Try again in a minute or type the numbers.",
        },
        { status: 502 },
      );
    }
    const message = error instanceof Error ? error.message : "failed";
    if (message === "scan-not-configured") {
      return Response.json({ ok: false, error: "Photo scanning is not switched on yet." }, { status: 503 });
    }
    console.error(`[scan] failed: ${message.slice(0, 200)}`);
    return Response.json(
      { ok: false, error: "Could not read that image. Try a clearer screenshot, or type the times." },
      { status: 502 },
    );
  }
}
