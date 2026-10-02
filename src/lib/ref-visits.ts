/**
 * Link-label funnel for the admin page: visits per ?ref= label (counted by the proxy,
 * one per page load, nothing stored about the visitor), sign-ups and first tests. Pure.
 */

import { signupSource } from "@/lib/beta";

export interface VisitRequest {
  method: string;
  pathname: string;
  ref: string | null;
  header: (name: string) => string | null;
}

/** Link previews, crawlers and uptime checks: not people. */
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|whatsapp|vercel|headless|curl|wget|python|node-fetch|axios|monitor/i;

/**
 * The label to count for this request, or null. Counts full page loads only: not
 * prefetches or in-app navigation (which carry the label on to sign-in), not the app or
 * sign-in pages, not bots.
 */
export function refToCount(req: VisitRequest): string | null {
  if (req.method !== "GET") return null;
  const label = signupSource(req.ref);
  if (!label) return null;
  if (/^\/(app|auth|login)(\/|$)/.test(req.pathname)) return null;
  if (req.header("rsc") !== null || req.header("next-router-prefetch") !== null) return null;
  const purpose = `${req.header("purpose") ?? ""} ${req.header("sec-purpose") ?? ""}`;
  if (/prefetch|prerender/i.test(purpose)) return null;
  const agent = req.header("user-agent");
  if (!agent || BOT.test(agent)) return null;
  return label;
}

export interface FunnelRow {
  label: string;
  visits: number;
  signups: number;
  firstTests: number;
}

/**
 * One row per link label: visits in the rows given, all-time sign-ups that carry the
 * label, and how many of those accounts have logged a test. Most visits first.
 */
export function refFunnel(
  visits: { label: string; visits: number }[],
  users: { id: string; source: string }[],
  tested: Set<string>,
): FunnelRow[] {
  const rows = new Map<string, FunnelRow>();
  const row = (label: string) => {
    let r = rows.get(label);
    if (!r) rows.set(label, (r = { label, visits: 0, signups: 0, firstTests: 0 }));
    return r;
  };
  for (const v of visits) row(v.label).visits += v.visits;
  for (const u of users) {
    const label = signupSource(u.source);
    if (!label || label === "invited" || label === "direct") continue;
    const r = row(label);
    r.signups += 1;
    if (tested.has(u.id)) r.firstTests += 1;
  }
  return [...rows.values()].sort(
    (a, b) => b.visits - a.visits || b.signups - a.signups || a.label.localeCompare(b.label),
  );
}
