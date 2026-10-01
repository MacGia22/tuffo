import { describe, expect, it } from "vitest";
import type { StoredPlan } from "@/lib/plan/stored";
import { renderAlertEmail, type EmailContext } from "../email";

const POOL = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const plan = {
  computedAt: "2026-10-01T06:00:00Z",
  version: 1,
  summary: {
    kind: "manual",
    fc: { min: 3, targetLow: 5, targetHigh: 7, slam: 16 },
    floor: 4.5,
    swgPercent: null,
    swgNeedPpm: null,
    capped: false,
    lowWithoutChlorine: "2026-10-01",
    confidence: "own",
    pairs: 6,
    fcStart: 5,
    lastTestAt: "2026-09-30T12:00:00Z",
    daysSinceTest: 1,
    product: "liquid-chlorine-12.5",
  },
  days: [
    { date: "2026-10-01", lossPpm: 2.4, addPpm: 2, fcAfterAdd: 7, fcEnd: 4.6, algaeRisk: false, rainMm: 0, dilution: null, estimated: false, addMl: 908 },
    { date: "2026-10-02", lossPpm: 1.1, addPpm: 0, fcAfterAdd: 4.6, fcEnd: 2.9, algaeRisk: true, rainMm: 51, dilution: { percent: 3.3, cya: 39, ch: 290, salt: null }, estimated: false, addMl: 0 },
  ],
} as StoredPlan;

const ctx: EmailContext = {
  units: "us",
  siteUrl: "https://tuffo.app",
  plans: { [POOL]: plan },
  unsubscribeUrl: "https://tuffo.app/alerts/unsubscribe?t=abc",
};

describe("renderAlertEmail", () => {
  it("writes one alert as its own subject, with the plan's dose in shelf units", () => {
    const email = renderAlertEmail([{ poolId: POOL, poolName: "Backyard", kind: "algae", detail: { date: "2026-10-01" } }], ctx);
    expect(email.subject).toBe("Backyard: free chlorine may run low");
    expect(email.text).toContain("may fall below 3 ppm by Thursday");
    expect(email.text).toContain("add 1 qt of liquid chlorine"); // 908 mL
    expect(email.text).toContain("Tuffo advises; you decide.");
    expect(email.text).toContain("https://tuffo.app/alerts/unsubscribe?t=abc");
  });

  it("puts several alerts in one email", () => {
    const email = renderAlertEmail(
      [
        { poolId: POOL, poolName: "Backyard", kind: "test_reminder", detail: { days: 8 } },
        { poolId: POOL, poolName: "Backyard", kind: "weekly", detail: {} },
      ],
      ctx,
    );
    expect(email.subject).toBe("Tuffo: 2 things for your pool today");
    expect(email.text).toContain("It has been 8 days since the last test.");
    expect(email.text).toContain("Thursday: add 1 qt of liquid chlorine");
    expect(email.text).toContain("Friday: nothing to add (watch: may run low) (heavy rain: retest stabilizer, calcium, salt after)");
    expect(email.text).toContain(`https://tuffo.app/app/pools/${POOL}/readings/new`);
  });

  it("escapes pool names in HTML", () => {
    const email = renderAlertEmail([{ poolId: POOL, poolName: "<b>Pool</b>", kind: "test_reminder", detail: { days: 7 } }], ctx);
    expect(email.html).toContain("&lt;b&gt;Pool&lt;/b&gt;");
    expect(email.html).not.toContain("<b>Pool</b>");
  });
});

describe("maintenance reminder", () => {
  it("lists the tasks and links to the maintenance page", () => {
    const email = renderAlertEmail(
      [{ poolId: POOL, poolName: "Backyard", kind: "maintenance", detail: { tasks: ["Inspect the salt cell (3 days overdue)"] } }],
      ctx,
    );
    expect(email.subject).toBe("Backyard: maintenance due");
    expect(email.text).toContain("Inspect the salt cell (3 days overdue)");
    expect(email.text).toContain(`https://tuffo.app/app/pools/${POOL}/maintenance`);
  });
});
