import { fromParam } from "@/lib/return-to";

/** The four ways to log something for a pool, each returning to `current`. */
export function logLinks(poolId: string, current: string) {
  const from = fromParam(current);
  const base = `/app/pools/${poolId}`;
  return [
    { href: `${base}/readings/new?${from}`, label: "Log a test" },
    { href: `${base}/doses/new?${from}`, label: "Log a dose" },
    { href: `${base}/events/new?${from}`, label: "Log an event" },
    { href: `${base}/readings/new?${from}#scan`, label: "Scan a test" },
  ];
}
