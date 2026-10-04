import type { Units } from "@/lib/format";

/**
 * Units to show before the person picks any: metric when the browser's time zone is in
 * Australia or its language has a region other than the US (en-AU, en-GB, it-IT…), US
 * units otherwise (en-US, or a language with no region). Worked out in the browser;
 * nothing is sent anywhere.
 */
export function unitsForBrowser({ timeZone, language }: { timeZone?: string | null; language?: string | null }): Units {
  if (timeZone?.startsWith("Australia/")) return "metric";
  const region = (language ?? "").split(/[-_]/)[1];
  if (region && /^[A-Za-z]{2}$/.test(region) && region.toUpperCase() !== "US") return "metric";
  return "us";
}
