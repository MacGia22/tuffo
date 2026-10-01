import { describe, expect, it } from "vitest";
import { setupSteps } from "../setup";

const none = {
  poolId: "p1",
  swg: true,
  hasLocation: false,
  hasTest: false,
  hasEquipment: false,
  hasFilter: false,
  cellInstalled: false,
  hasCleanPressure: false,
  hasPumpSchedule: false,
  alertsOn: false,
};

describe("setupSteps", () => {
  it("has seven steps for a salt pool, five otherwise", () => {
    expect(setupSteps(none).map((s) => s.key)).toEqual(["location", "test", "equipment", "cell", "pressure", "pump", "alerts"]);
    expect(setupSteps({ ...none, swg: false }).map((s) => s.key)).toEqual(["location", "test", "equipment", "pressure", "alerts"]);
  });

  it("marks what is done and links to where it is done", () => {
    const steps = setupSteps({ ...none, hasLocation: true, hasTest: true, hasFilter: true });
    expect(steps.filter((s) => s.done).map((s) => s.key)).toEqual(["location", "test"]);
    expect(steps.find((s) => s.key === "pressure")?.href).toBe("/app/pools/p1/maintenance#pressure");
    expect(setupSteps(none).find((s) => s.key === "pressure")?.href).toBe("/app/pools/p1/settings");
    expect(steps.find((s) => s.key === "test")?.href).toBe("/app/pools/p1/readings/new?from=%2Fapp%2Fpools%2Fp1");
  });
});
