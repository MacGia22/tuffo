import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_LIMITS,
  dayStart,
  decide,
  monthStart,
  nextMonthStart,
  resetLabel,
  scanCounts,
  pruneScanLog,
  scanLimits,
  startScan,
} from "../quota";

const NOW = new Date("2026-09-27T15:30:00Z");

describe("scanLimits", () => {
  it("uses the defaults unless the environment sets whole positive numbers", () => {
    expect(scanLimits({})).toEqual(DEFAULT_LIMITS);
    expect(scanLimits({ SCAN_MONTHLY_LIMIT: "50", SCAN_DAILY_GLOBAL_LIMIT: " 1000 " })).toMatchObject({
      monthly: 50,
      dailyGlobal: 1000,
    });
    expect(scanLimits({ SCAN_MONTHLY_LIMIT: "0", SCAN_DAILY_GLOBAL_LIMIT: "lots" })).toMatchObject({
      monthly: 30,
      dailyGlobal: 300,
    });
  });
});

describe("calendar helpers", () => {
  it("works in UTC", () => {
    expect(monthStart(NOW).toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(nextMonthStart(NOW).toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(nextMonthStart(new Date("2026-12-31T23:00:00Z")).toISOString()).toBe("2027-01-01T00:00:00.000Z");
    expect(dayStart(NOW).toISOString()).toBe("2026-09-27T00:00:00.000Z");
    expect(resetLabel(NOW)).toBe("October 1");
  });
});

describe("decide", () => {
  const limits = DEFAULT_LIMITS;

  it("allows and says what is left", () => {
    expect(decide({ month: 4, recent: 1, today: 20 }, limits, NOW)).toEqual({ allowed: true, remaining: 26 });
  });

  it("stops at the monthly allowance and names the reset day", () => {
    const d = decide({ month: 30, recent: 0, today: 0 }, limits, NOW);
    expect(d).toMatchObject({ allowed: false, reason: "monthly", remaining: 0 });
    if (!d.allowed) expect(d.message).toContain("October 1");
  });

  it("slows down bursts", () => {
    expect(decide({ month: 3, recent: 6, today: 0 }, limits, NOW)).toMatchObject({
      allowed: false,
      reason: "burst",
      remaining: 27,
    });
  });

  it("stops everyone at the daily backstop", () => {
    expect(decide({ month: 0, recent: 0, today: 300 }, limits, NOW)).toMatchObject({ allowed: false, reason: "daily" });
  });
});

/** Just enough of the query builder: every filter returns itself, awaiting gives the canned answer. */
function fakeDb(answers: Array<{ count?: number | null; error?: { code?: string; message: string } | null }>) {
  let call = 0;
  const filters: string[][] = [];
  const client = {
    from() {
      const mine: string[] = [];
      filters.push(mine);
      const answer = answers[call++] ?? { count: 0, error: null };
      const builder = {
        select: () => builder,
        eq: (col: string) => (mine.push(`eq:${col}`), builder),
        gte: (col: string) => (mine.push(`gte:${col}`), builder),
        then: (resolve: (v: unknown) => unknown) => Promise.resolve({ count: null, error: null, ...answer }).then(resolve),
      };
      return builder;
    },
  };
  return { client: client as unknown as SupabaseClient, filters };
}

describe("scanCounts", () => {
  it("returns the three counts", async () => {
    const { client, filters } = fakeDb([{ count: 5 }, { count: 2 }, { count: 40 }]);
    await expect(scanCounts(client, "u1", NOW, DEFAULT_LIMITS)).resolves.toEqual({ month: 5, recent: 2, today: 40 });
    expect(filters[0]).toEqual(["eq:user_id", "eq:ok", "gte:created_at"]);
    expect(filters[1]).toEqual(["eq:user_id", "gte:created_at"]);
    expect(filters[2]).toEqual(["eq:ok", "gte:created_at"]);
  });

  it("gives up (and so allows) when the table is missing", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const missing = { code: "PGRST205", message: "Could not find the table 'public.scans'" };
    const { client } = fakeDb([{ error: missing }, { error: missing }, { error: missing }]);
    await expect(scanCounts(client, "u1", NOW, DEFAULT_LIMITS)).resolves.toBeNull();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("startScan", () => {
  it("returns null instead of throwing when the insert fails", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const client = {
      from: () => ({
        insert: () => ({
          select: () => ({ single: async () => ({ data: null, error: { code: "42P01", message: "missing" } }) }),
        }),
      }),
    } as unknown as SupabaseClient;
    await expect(startScan(client, "u1")).resolves.toBeNull();
    spy.mockRestore();
  });
});

describe("pruneScanLog", () => {
  it("deletes rows older than a year", async () => {
    let cutoff = "";
    const client = {
      from: () => ({
        delete: () => ({
          lt: async (_col: string, value: string) => {
            cutoff = value;
            return { error: null };
          },
        }),
      }),
    } as unknown as SupabaseClient;
    await expect(pruneScanLog(client, NOW)).resolves.toBe(true);
    expect(cutoff).toBe("2025-09-27T15:30:00.000Z");
  });
});
