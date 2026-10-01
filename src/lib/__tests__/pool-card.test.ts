import { describe, expect, it } from "vitest";
import type { StoredPlan } from "@/lib/plan/stored";
import { cardFacts } from "../pool-card";

const now = Date.parse("2026-10-01T12:00:00Z");
const day = (date: string, addMl: number) => ({
  date, lossPpm: 2, addPpm: 1, fcAfterAdd: 5, fcEnd: 3, algaeRisk: false, rainMm: 0, dilution: null, estimated: false, addMl,
});
const plan = (kind: "manual" | "swg", swgPercent: number | null, addMl: number) =>
  ({ computedAt: "", version: 1, summary: { kind, swgPercent }, days: [day("2026-10-01", addMl)] }) as unknown as StoredPlan;

const base = {
  units: "us" as const,
  today: "2026-10-01",
  now,
  latestFc: { takenAt: "2026-09-28T12:00:00Z", fc: 2.5, target: { low: 3, high: 4.5 } },
  lastTestAt: "2026-09-28T12:00:00Z",
  plan: null,
  maintenance: null,
  alertsOn: false,
};

describe("cardFacts", () => {
  it("summarises the last test against the FC target", () => {
    const f = cardFacts(base);
    expect(f.age).toEqual({ text: "3 days ago", stale: false });
    expect(f.fc).toEqual({ value: 2.5, level: "low", target: "3–4.5" });
    expect(f.action).toBeNull();
    expect(f.maintenance).toBeNull();
  });

  it("gives today's plan action in shelf units, or the cell setting", () => {
    expect(cardFacts({ ...base, plan: plan("manual", null, 908) }).action).toBe("Add 1 qt");
    expect(cardFacts({ ...base, plan: plan("manual", null, 0) }).action).toBe("Nothing to add");
    expect(cardFacts({ ...base, plan: plan("swg", 50, 0) }).action).toBe("Cell 50%");
    expect(cardFacts({ ...base, plan: plan("swg", null, 0) }).action).toBeNull();
  });

  it("counts maintenance due and overdue", () => {
    expect(cardFacts({ ...base, maintenance: { overdue: 2, due: 1 } }).maintenance).toEqual({ text: "2 overdue, 1 due", overdue: true });
    expect(cardFacts({ ...base, maintenance: { overdue: 0, due: 1 } }).maintenance).toEqual({ text: "1 due", overdue: false });
    expect(cardFacts({ ...base, maintenance: { overdue: 0, due: 0 } }).maintenance).toBeNull();
  });

  it("handles a pool with no tests", () => {
    const f = cardFacts({ ...base, latestFc: null, lastTestAt: null });
    expect(f.age).toBeNull();
    expect(f.fc).toBeNull();
  });
});
