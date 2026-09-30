import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { SupabaseClient } from "@supabase/supabase-js";
import { dailyLimit, runAlertsJob } from "../job";

const admin = {} as SupabaseClient; // never touched when the job is skipped

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("runAlertsJob", () => {
  it("sends nothing outside production (previews share the production database)", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("CRON_SECRET", "s");
    expect(await runAlertsJob(admin)).toMatchObject({ skipped: "not production", sent: 0 });
  });

  it("sends nothing until RESEND_API_KEY is set", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("CRON_SECRET", "s");
    expect(await runAlertsJob(admin)).toMatchObject({ skipped: "RESEND_API_KEY or CRON_SECRET not set", sent: 0 });
  });
});

describe("dailyLimit", () => {
  it("defaults to 1,000 and reads ALERT_DAILY_LIMIT", () => {
    vi.stubEnv("ALERT_DAILY_LIMIT", "");
    expect(dailyLimit()).toBe(1000);
    vi.stubEnv("ALERT_DAILY_LIMIT", "25");
    expect(dailyLimit()).toBe(25);
    vi.stubEnv("ALERT_DAILY_LIMIT", "lots");
    expect(dailyLimit()).toBe(1000);
  });
});
