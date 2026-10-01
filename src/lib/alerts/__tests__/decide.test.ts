import { describe, expect, it } from "vitest";
import { dueAlerts, type PoolAlertSettings, type PoolAlertState } from "../decide";

const POOL = "11111111-1111-4111-8111-111111111111";
const today = "2026-10-01"; // a Thursday
const now = Date.parse("2026-10-01T11:30:00Z");

const settings: PoolAlertSettings = { poolId: POOL, poolName: "Backyard", algae: true, testReminder: true, testAfterDays: 7, weekly: true };
const calm: PoolAlertState = { poolId: POOL, lastTestAt: "2026-09-30T12:00:00Z", plan: { fcStart: 5, fcMin: 3, riskDates: [] } };

describe("dueAlerts", () => {
  it("sends nothing on a calm day", () => {
    expect(dueAlerts({ today, now, settings: [settings], state: [calm], sent: [] })).toEqual([]);
  });

  it("warns of algae risk today or tomorrow, not later", () => {
    const risky = { ...calm, plan: { ...calm.plan!, riskDates: ["2026-10-02"] } };
    expect(dueAlerts({ today, now, settings: [settings], state: [risky], sent: [] })).toEqual([
      { poolId: POOL, poolName: "Backyard", kind: "algae", detail: { date: "2026-10-02" } },
    ]);
    const later = { ...calm, plan: { ...calm.plan!, riskDates: ["2026-10-05"] } };
    expect(dueAlerts({ today, now, settings: [settings], state: [later], sent: [] })).toEqual([]);
  });

  it("warns when FC is already estimated below the minimum, at most every 3 days", () => {
    const low = { ...calm, plan: { ...calm.plan!, fcStart: 2 } };
    expect(dueAlerts({ today, now, settings: [settings], state: [low], sent: [] })[0]).toMatchObject({ kind: "algae", detail: { date: today } });
    const sent = [{ poolId: POOL, kind: "algae" as const, sentOn: "2026-09-29" }];
    expect(dueAlerts({ today, now, settings: [settings], state: [low], sent })).toEqual([]);
    const older = [{ poolId: POOL, kind: "algae" as const, sentOn: "2026-09-28" }];
    expect(dueAlerts({ today, now, settings: [settings], state: [low], sent: older })).toHaveLength(1);
  });

  it("reminds to test after N days, once per gap", () => {
    const stale = { ...calm, lastTestAt: "2026-09-23T12:00:00Z" }; // 7 days 23.5 h ago
    expect(dueAlerts({ today, now, settings: [settings], state: [stale], sent: [] })).toEqual([
      { poolId: POOL, poolName: "Backyard", kind: "test_reminder", detail: { days: 7 } },
    ]);
    const reminded = [{ poolId: POOL, kind: "test_reminder" as const, sentOn: "2026-09-30" }];
    expect(dueAlerts({ today, now, settings: [settings], state: [stale], sent: reminded })).toEqual([]);
    expect(dueAlerts({ today, now, settings: [{ ...settings, testAfterDays: 10 }], state: [stale], sent: [] })).toEqual([]);
  });

  it("sends the weekly summary on Saturdays only", () => {
    const saturday = "2026-10-03";
    const satNow = Date.parse("2026-10-03T11:30:00Z");
    expect(dueAlerts({ today: saturday, now: satNow, settings: [settings], state: [calm], sent: [] })).toEqual([
      { poolId: POOL, poolName: "Backyard", kind: "weekly", detail: {} },
    ]);
    expect(dueAlerts({ today, now, settings: [{ ...settings, algae: false, testReminder: false }], state: [calm], sent: [] })).toEqual([]);
  });

  it("never sends a second email the same day", () => {
    const low = { ...calm, plan: { ...calm.plan!, fcStart: 2 } };
    const sentToday = [{ poolId: null, kind: "weekly" as const, sentOn: today }];
    expect(dueAlerts({ today, now, settings: [settings], state: [low], sent: sentToday })).toEqual([]);
  });

  it("respects opt-outs", () => {
    const low = { ...calm, lastTestAt: "2026-09-01T12:00:00Z", plan: { ...calm.plan!, fcStart: 2 } };
    const off = { ...settings, algae: false, testReminder: false, weekly: false };
    expect(dueAlerts({ today, now, settings: [off], state: [low], sent: [] })).toEqual([]);
  });
});

describe("maintenance reminders", () => {
  const on = { ...settings, algae: false, testReminder: false, weekly: false, maintenance: true };
  const due = { ...calm, maintenanceDue: ["Inspect the salt cell (3 days overdue)"] };

  it("lists the upkeep due, at most once a week per pool", () => {
    expect(dueAlerts({ today, now, settings: [on], state: [due], sent: [] })).toEqual([
      { poolId: POOL, poolName: "Backyard", kind: "maintenance", detail: { tasks: ["Inspect the salt cell (3 days overdue)"] } },
    ]);
    const lastWeek = [{ poolId: POOL, kind: "maintenance" as const, sentOn: "2026-09-26" }];
    expect(dueAlerts({ today, now, settings: [on], state: [due], sent: lastWeek })).toEqual([]);
    const older = [{ poolId: POOL, kind: "maintenance" as const, sentOn: "2026-09-24" }];
    expect(dueAlerts({ today, now, settings: [on], state: [due], sent: older })).toHaveLength(1);
  });

  it("sends nothing when switched off or nothing is due", () => {
    expect(dueAlerts({ today, now, settings: [{ ...on, maintenance: false }], state: [due], sent: [] })).toEqual([]);
    expect(dueAlerts({ today, now, settings: [on], state: [calm], sent: [] })).toEqual([]);
  });
});
