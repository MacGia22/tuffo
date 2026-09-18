import { getCurrentUser } from "@/lib/auth/user";
import { serverEnv } from "@/lib/env";
import { extractReading, SCAN_MEDIA_TYPES, type ScanMediaType } from "@/lib/scan/extract";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 6 * 1024 * 1024;

/**
 * POST multipart/form-data with an `image` part. Signed-in users only. Returns the
 * numbers read from the photo for review; the photo itself is not kept.
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

  try {
    const result = await extractReading({ bytes: Buffer.from(await file.arrayBuffer()), mediaType });
    return Response.json({ ok: true, ...result, usage: undefined });
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed";
    const status = message === "scan-not-configured" ? 503 : 502;
    return Response.json(
      { ok: false, error: status === 503 ? "Photo scanning is not switched on yet." : "Could not read that photo. Try a sharper, straight-on shot." },
      { status },
    );
  }
}
