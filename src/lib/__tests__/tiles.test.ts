import { describe, expect, it } from "vitest";
import { historyCells, levelOf, rangeText, signed, testAge, tileForProduct, waterLine, waterTiles, type WaterTilesInput } from "../tiles";

const targets = {
  fc: { low: 3, high: 4.5 },
  ph: { low: 7.2, high: 7.8 },
  ta: { low: 60, high: 80 },
  ch: { low: 250, high: 450 },
  cya: { low: 60, high: 80 },
  salt: { low: 2800, high: 3600 },
};

describe("tiles", () => {
  it("rates a value against its range, ends inside", () => {
    expect(levelOf(2.9, targets.fc)).toBe("low");
    expect(levelOf(3, targets.fc)).toBe("ok");
    expect(levelOf(4.5, targets.fc)).toBe("ok");
    expect(levelOf(4.6, targets.fc)).toBe("high");
    expect(rangeText({ low: 3, high: 4.5 })).toBe("3–4.5");
    expect(rangeText({ low: 7.2, high: 7.8 })).toBe("7.2–7.8");
  });

  it("says how old the test is and flags a week", () => {
    const now = Date.parse("2026-10-01T12:00:00Z");
    expect(testAge("2026-10-01T11:30:00Z", now).text).toBe("just now");
    expect(testAge("2026-10-01T07:00:00Z", now).text).toBe("5 hours ago");
    expect(testAge("2026-09-30T08:00:00Z", now).text).toBe("yesterday");
    expect(testAge("2026-09-28T12:00:00Z", now)).toMatchObject({ text: "3 days ago", stale: false });
    expect(testAge("2026-09-23T12:00:00Z", now)).toMatchObject({ text: "8 days ago", stale: true });
  });
});

describe("historyCells", () => {
  it("formats each measure and rates it against the pool's targets", () => {
    const cells = historyCells({ fc: 2.5, cc: 0.8, ph: 7.45, ta: 70, ch: 300, cya: null, salt: 3200 }, targets);
    expect(cells.map((c) => [c.label, c.text, c.level])).toEqual([
      ["FC", "2.5", "low"],
      ["CC", "0.8", "high"],
      ["pH", "7.45", "ok"],
      ["TA", "70", "ok"],
      ["CH", "300", "ok"],
      ["CYA", "—", null],
      ["Salt", "3200", "ok"],
    ]);
  });

  it("leaves salt unrated without a salt target", () => {
    const cells = historyCells({ fc: 4, cc: null, ph: 7.5, ta: 70, ch: 300, cya: 70, salt: 900 }, { ...targets, salt: undefined });
    expect(cells.find((c) => c.key === "salt")).toEqual({ key: "salt", label: "Salt", text: "900", level: null });
    expect(cells.find((c) => c.key === "ph")?.text).toBe("7.5");
  });
});

describe("waterTiles", () => {
  const now = Date.parse("2026-10-01T16:00:00Z");
  const base: WaterTilesInput = {
    readings: [],
    targets,
    fcMin: 2,
    fcSlam: 24,
    swg: true,
    doses: [],
    now,
    timeZone: "America/New_York",
  };
  const tile = (input: Partial<WaterTilesInput>, key: string) => waterTiles({ ...base, ...input }).find((t) => t.key === key)!;

  it("lists FC, pH, TA, CYA, CH and salt only for salt pools", () => {
    expect(waterTiles(base).map((t) => t.key)).toEqual(["fc", "ph", "ta", "cya", "ch", "salt"]);
    expect(waterTiles({ ...base, swg: false, targets: { ...targets, salt: undefined } }).map((t) => t.label)).toEqual([
      "Free chlorine",
      "pH",
      "Alkalinity",
      "Stabilizer",
      "Calcium",
    ]);
  });

  it("shows a measure never tested as no reading", () => {
    expect(tile({}, "cya")).toMatchObject({
      valueText: "\u2014",
      state: "none",
      chip: "No reading",
      note: "Add it with your next test",
      target: "target 60–80 ppm",
    });
  });

  it("takes each measure from its newest test and gives the change since the one before", () => {
    const readings = [
      { taken_at: "2026-09-18T16:00:00Z", fc: 3, ph: 7.6, cya: 70 },
      { taken_at: "2026-09-26T16:00:00Z", fc: 8, ph: 7.4, cya: null },
    ];
    expect(tile({ readings }, "fc")).toMatchObject({ valueText: "8.0", state: "high", chip: "High", note: "+5.0 since Sep 18" });
    expect(tile({ readings }, "ph")).toMatchObject({ valueText: "7.4", state: "ok", chip: "OK", note: "\u22120.2 since Sep 18" });
    // Stabilizer comes from the older test, 13 days ago: not old yet, nothing to compare.
    expect(tile({ readings }, "cya")).toMatchObject({ value: 70, state: "ok", note: null });
  });

  it("works the change out from the values as shown", () => {
    const pair = (a: number, b: number, key: "fc" | "ph") => [
      { taken_at: "2026-09-29T16:00:00Z", [key]: a },
      { taken_at: "2026-09-30T16:00:00Z", [key]: b },
    ];
    // 7.4 → 7.45 is +0.05 (the raw difference is 0.0499…).
    expect(tile({ readings: pair(7.4, 7.45, "ph") }, "ph").note).toBe("+0.05 since Sep 29");
    expect(tile({ readings: pair(7.45, 7.5, "ph") }, "ph").note).toBe("+0.05 since Sep 29");
    expect(tile({ readings: pair(7.5, 7.5, "ph") }, "ph").note).toBe("No change since Sep 29");
    // FC shown to one decimal: 3.0 → 3.1, and 3.0 → 3.05 (shown as 3.0) is no change.
    expect(tile({ readings: pair(3, 3.1, "fc") }, "fc").note).toBe("+0.1 since Sep 29");
    expect(tile({ readings: pair(3, 3.05, "fc") }, "fc")).toMatchObject({ valueText: "3.0", note: "No change since Sep 29" });
    expect(tile({ readings: pair(3.05, 3.15, "fc") }, "fc").note).toBe("+0.1 since Sep 29");
  });

  it("prefers something added in the last 7 days over the change", () => {
    const readings = [
      { taken_at: "2026-09-18T16:00:00Z", cya: 40 },
      { taken_at: "2026-09-26T16:00:00Z", cya: 50 },
    ];
    const doses = [
      { productId: "cyanuric-acid", group: "Stabilizer", addedAt: "2026-09-29T22:00:00Z", amountText: "1.5 lb" },
      { productId: "cyanuric-acid", group: "Stabilizer", addedAt: "2026-09-20T22:00:00Z", amountText: "3 lb" },
      { productId: "liquid-chlorine-12.5", group: "Chlorine", addedAt: "2026-09-30T22:00:00Z", amountText: "1 qt" },
    ];
    expect(tile({ readings, doses }, "cya")).toMatchObject({ state: "low", chip: "Low", note: "1.5 lb added Sep 29" });
    // A dose older than 7 days does not count.
    expect(tile({ readings, doses: doses.slice(1, 2) }, "cya").note).toBe("+10 since Sep 18");
  });

  it("turns free chlorine outside its safe bounds into an action", () => {
    const low = [{ taken_at: "2026-09-30T16:00:00Z", fc: 1.5 }];
    expect(tile({ readings: low, fcAction: "Add 1 qt of liquid chlorine 12.5% now" }, "fc")).toMatchObject({
      state: "too-low",
      chip: "Too low",
      note: "Add 1 qt of liquid chlorine 12.5% now",
    });
    // Chlorine added after that test: the action is done, say so.
    const doses = [{ productId: "liquid-chlorine-12.5", group: "Chlorine", addedAt: "2026-09-30T20:00:00Z", amountText: "1 qt" }];
    expect(tile({ readings: low, doses }, "fc").note).toBe("1 qt added Sep 30");
    // Logged in the same minute as the test: still after it, as the advice counts it.
    const sameMinute = [{ ...doses[0], addedAt: "2026-09-30T16:00:00Z" }];
    expect(tile({ readings: low, doses: sameMinute }, "fc").note).toBe("1 qt added Sep 30");
    expect(tile({ readings: [{ taken_at: "2026-09-30T16:00:00Z", fc: 26 }] }, "fc")).toMatchObject({
      state: "too-high",
      chip: "Too high",
      note: "Add nothing; swim once it is below 24 ppm",
    });
  });

  it("marks old readings: FC and pH after 7 days, the rest after 30", () => {
    const readings = [{ taken_at: "2026-08-30T16:00:00Z", fc: 4, ch: 300 }];
    expect(tile({ readings }, "fc")).toMatchObject({ state: "old", chip: "32 days ago", note: "Retest today", valueText: "4.0" });
    expect(tile({ readings }, "ch")).toMatchObject({ state: "old", chip: "32 days ago", note: "Retest this month" });
    expect(tile({ readings: [{ taken_at: "2026-09-02T16:00:00Z", ch: 300 }] }, "ch").state).toBe("ok");
    // Counted in the pool's days, as the test card counts them: Thursday 8 PM to Friday 8 AM a week on.
    const thursday = [{ taken_at: "2026-09-25T00:00:00Z", fc: 4 }];
    expect(tile({ readings: thursday, now: Date.parse("2026-10-02T12:00:00Z") }, "fc").chip).toBe("8 days ago");
    expect(testAge("2026-09-25T00:00:00Z", Date.parse("2026-10-02T12:00:00Z"), "America/New_York").text).toBe("8 days ago");
  });

  it("maps products to the measure they are for", () => {
    expect(tileForProduct("soda-ash", "Raise pH or alkalinity")).toBe("ph");
    expect(tileForProduct("baking-soda", "Raise pH or alkalinity")).toBe("ta");
    expect(tileForProduct("dry-acid-93", "Lower pH")).toBe("ph");
    expect(tileForProduct("salt", "Salt")).toBe("salt");
    expect(tileForProduct("mystery", undefined)).toBeNull();
  });
});

describe("waterLine", () => {
  it("joins whatever was logged, with a true minus sign", () => {
    expect(waterLine({ temp: "84 °F", cc: 0, csi: { value: -0.24, verdict: "balanced" } })).toBe(
      "Water 84 °F · CC 0.0 · CSI \u22120.24 (balanced)",
    );
    expect(waterLine({ temp: null, cc: 0.4, csi: null })).toBe("CC 0.4");
    expect(waterLine({ temp: null, cc: null, csi: { value: 0.004, verdict: "balanced" } })).toBe("CSI 0.00 (balanced)");
    // Rounded and verdict agree: −0.62 corrosive, −0.58 balanced (one decimal showed both as −0.6).
    expect(waterLine({ temp: null, cc: null, csi: { value: -0.619, verdict: "corrosive" } })).toBe("CSI \u22120.62 (corrosive)");
    expect(waterLine({ temp: null, cc: null, csi: null })).toBeNull();
    expect(signed(0.35, 1)).toBe("+0.4");
  });
});
