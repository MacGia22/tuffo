import "server-only";

import { headers } from "next/headers";
import { createRateLimiter } from "@/lib/beta";

/**
 * Per-address limits for the public forecast, kept in memory per server instance. The
 * address is the map key only: never stored, logged or sent anywhere.
 */
const forecasts = createRateLimiter({ limit: 30, windowMs: 10 * 60_000 });
const searches = createRateLimiter({ limit: 60, windowMs: 10 * 60_000 });

async function clientKey(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

export async function allowForecast(): Promise<boolean> {
  return forecasts(await clientKey());
}

export async function allowPlaceSearch(): Promise<boolean> {
  return searches(await clientKey());
}
