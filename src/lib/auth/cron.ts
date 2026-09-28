import { timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/lib/env";

/**
 * True when the request carries `Authorization: Bearer <CRON_SECRET>`, as the Vercel
 * cron sends it. Without the secret set, nothing is authorised.
 */
export function cronAuthorised(request: Request): boolean {
  const secret = serverEnv.cronSecret();
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (header.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}
