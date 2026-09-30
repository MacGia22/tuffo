import { describe, expect, it } from "vitest";
import { adviseFor, type AdviceReading, type LoggedDose } from "../advice";

const pool = { volumeL: 56781, sanitizer: "chlorine" as const, surface: "plaster" as const }; // 15,000 gal

const balanced: AdviceReading = {
  fc: 5,
  cc: 0,
  ph: 7.5,
  ta: 70,
  ch: 300,
  cya: 40,
  salt: null,
  waterTempC: 28,
  borate: null,
};

describe("adviseFor", () => {
  it("says all is well for balanced water", () => {
    const advice = adviseFor(pool, balanced);
    expect(advice.items.every((i) => i.severity === "ok")).toBe(true);
    expect(advice.assumptions).toEqual([]);
    expect(advice.items.find((i) => i.measure === "fc")?.title).toContain("on target");
  });

  it("recommends liquid chlorine when FC is under the minimum", () => {
    const advice = adviseFor(pool, { ...balanced, fc: 1 });
    const fc = advice.items[0];
    expect(fc.measure).toBe("fc");
    expect(fc.severity).toBe("act");
    expect(fc.dose?.productId).toBe("liquid-chlorine-12.5");
    // 15,000 gal from 1 to 6 ppm with 12.5%: about 6 US quarts (~1.9 L → ~2.3 L)
    expect(fc.dose?.amount).toBeGreaterThan(2000);
    expect(fc.dose?.amount).toBeLessThan(2600);
    expect(fc.dose?.unit).toBe("mL");
  });

  it("recommends acid for high pH and puts it first", () => {
    const advice = adviseFor(pool, { ...balanced, ph: 8.0 });
    expect(advice.items[0].measure).toBe("ph");
    expect(advice.items[0].dose?.productId).toBe("muriatic-acid-31.45");
    expect(advice.items[0].dose?.amount).toBeGreaterThan(0);
  });

  it("prefers aeration over soda ash when TA is already high", () => {
    const advice = adviseFor(pool, { ...balanced, ph: 7.0, ta: 130 });
    const ph = advice.items.find((i) => i.measure === "ph");
    expect(ph?.severity).toBe("act");
    expect(ph?.dose).toBeUndefined();
    expect(ph?.detail).toContain("aeration");
  });

  it("assumes defaults and says so when CYA and TA are missing", () => {
    const advice = adviseFor(pool, { ...balanced, cya: null, ta: null });
    expect(advice.assumptions.length).toBe(2);
    expect(advice.targets.fc.targetLow).toBe(4); // CYA 30 row
  });

  it("does not ask a vinyl pool for calcium", () => {
    const advice = adviseFor({ ...pool, surface: "vinyl" }, { ...balanced, ch: 80 });
    const ch = advice.items.find((i) => i.measure === "ch");
    expect(ch?.severity).toBe("ok");
    expect(ch?.dose).toBeUndefined();
  });

  it("handles salt pools", () => {
    const advice = adviseFor({ ...pool, sanitizer: "swg" }, { ...balanced, cya: 70, fc: 4, salt: 2400 });
    const salt = advice.items.find((i) => i.measure === "salt");
    expect(salt?.severity).toBe("act");
    expect(salt?.dose?.productId).toBe("salt");
    // 800 ppm in 56,781 L ≈ 45 kg
    expect(salt?.dose?.amount).toBeGreaterThan(44_000);
    expect(salt?.dose?.amount).toBeLessThan(46_000);
  });

  it("counts stabilizer logged after the test instead of asking for more", () => {
    const pound: LoggedDose = { productId: "cyanuric-acid", amount: 453.6, amountText: "1 lb", dateText: "Sep 27" };
    const swgPool = { ...pool, volumeL: 18927, sanitizer: "swg" as const }; // 5,000 gal: 1 lb ≈ +12 ppm
    const before = adviseFor(swgPool, { ...balanced, cya: 52 });
    expect(before.items.find((i) => i.measure === "cya")?.dose).toBeDefined();
    const after = adviseFor(swgPool, { ...balanced, cya: 52 }, [pound]);
    const cya = after.items.find((i) => i.measure === "cya");
    expect(cya?.severity).toBe("ok");
    expect(cya?.title).toMatch(/^Stabilizer about \d+ ppm is in range$/);
    expect(cya?.detail).toContain("Counts your 1 lb from Sep 27");
    expect(cya?.detail).toContain("about a week");
    expect(cya?.dose).toBeUndefined();
  });

  it("counts calcium chloride logged after the test instead of asking for more", () => {
    // 15,000 gal plaster pool at CH 200: target low 250, so the card asks for +100 ppm,
    // 100 × 56,781 / 680.8 ≈ 8,340 g (18.4 lb) of 77% calcium chloride.
    const before = adviseFor(pool, { ...balanced, ch: 200 }).items.find((i) => i.measure === "ch");
    expect(before?.dose?.amount).toBeGreaterThan(8_300);
    expect(before?.dose?.amount).toBeLessThan(8_380);

    // 10 lb (4,536 g) adds 4,536 × 680.8 / 56,781 ≈ 54 ppm: CH about 254, in range.
    const tenLb: LoggedDose = { productId: "calcium-chloride-77", amount: 4535.9, amountText: "10 lb", dateText: "Sep 29" };
    const after = adviseFor(pool, { ...balanced, ch: 200 }, [tenLb]).items.find((i) => i.measure === "ch");
    expect(after?.title).toBe("Calcium about 254 ppm is in range");
    expect(after?.severity).toBe("ok");
    expect(after?.detail).toContain("Counts your 10 lb from Sep 29.");
    expect(after?.dose).toBeUndefined();

    // 5 lb adds about 27 ppm: 227, still low, but no second dose until a retest.
    const fiveLb: LoggedDose = { ...tenLb, amount: 2268, amountText: "5 lb" };
    const partial = adviseFor(pool, { ...balanced, ch: 200 }, [fiveLb]).items.find((i) => i.measure === "ch");
    expect(partial?.title).toBe("Calcium about 227 ppm is still low");
    expect(partial?.severity).toBe("watch");
    expect(partial?.detail).toContain("retest before adding more");
    expect(partial?.dose).toBeUndefined();
  });

  it("does not add a calcium card for the calcium in cal-hypo when CH is in range", () => {
    const calHypo: LoggedDose = { productId: "cal-hypo-65", amount: 454, amountText: "1 lb", dateText: "Sep 29" };
    const advice = adviseFor(pool, { ...balanced, ch: 300 }, [calHypo]);
    expect(advice.items.find((i) => i.measure === "ch")).toBeUndefined();
  });

  it("counts salt logged after the test instead of asking for more", () => {
    const swgPool = { ...pool, sanitizer: "swg" as const };
    // Salt 2400, aim 3200: 800 ppm ≈ 45.4 kg before anything is logged.
    // 40 lb (18,144 g) adds 18,144 / 56.781 ≈ 320 ppm: about 2720, still below 2800.
    const fortyLb: LoggedDose = { productId: "salt", amount: 18143.7, amountText: "40 lb", dateText: "Sep 29" };
    const partial = adviseFor(swgPool, { ...balanced, salt: 2400 }, [fortyLb]).items.find((i) => i.measure === "salt");
    expect(partial?.title).toBe("Salt about 2720 ppm is still below the chlorinator's range");
    expect(partial?.severity).toBe("watch");
    expect(partial?.dose).toBeUndefined();

    // 100 lb (45,359 g) adds about 799 ppm: 3199, in range.
    const hundredLb: LoggedDose = { ...fortyLb, amount: 45359, amountText: "100 lb" };
    const done = adviseFor(swgPool, { ...balanced, salt: 2400 }, [hundredLb]).items.find((i) => i.measure === "salt");
    expect(done?.title).toBe("Salt about 3199 ppm is in range");
    expect(done?.severity).toBe("ok");
    expect(done?.detail).toContain("Counts your 100 lb from Sep 29.");
    expect(done?.dose).toBeUndefined();
  });

  it("asks for a retest, not a dose, after chlorine or acid is logged", () => {
    const advice = adviseFor(pool, { ...balanced, fc: 1, ph: 8.0 }, [
      { productId: "liquid-chlorine-12.5", amount: 1900, amountText: "2 qt", dateText: "Sep 27" },
      { productId: "muriatic-acid-31.45", amount: 400, amountText: "13.5 fl oz", dateText: "Sep 27" },
    ]);
    const fc = advice.items.find((i) => i.measure === "fc");
    const ph = advice.items.find((i) => i.measure === "ph");
    expect(fc?.title).toBe("Retest free chlorine before adding more");
    expect(fc?.detail).toContain("2 qt of liquid chlorine 12.5% from Sep 27");
    expect(fc?.dose).toBeUndefined();
    expect(ph?.title).toBe("Retest pH before adding more");
    expect(ph?.dose).toBeUndefined();
  });

  it("tells a salt pool with high chlorine to turn the cell down", () => {
    const advice = adviseFor({ ...pool, sanitizer: "swg" }, { ...balanced, fc: 8 });
    expect(advice.items.find((i) => i.measure === "fc")?.detail).toContain("chlorinator output down");
  });
});

describe("adviseFor, salt cell setting", () => {
  const swgPool = { ...pool, sanitizer: "swg" as const };
  // From the plan: a 1.4 lb/day cell in 15,000 gal makes 11.2 ppm/day at 100%; this week needs 1.86 ppm/day → 20%.
  const cell = { percent: 20, needPpm: 1.86 };

  it("gives the cell setting on target", () => {
    const fc = adviseFor(swgPool, { ...balanced, cya: 70, fc: 5 }, [], cell).items.find((i) => i.measure === "fc");
    expect(fc?.detail).toBe("The plan suggests about 20% for this week's weather (it needs to make about 1.9 ppm a day).");
  });

  it("gives it when low and when high", () => {
    const low = adviseFor(swgPool, { ...balanced, cya: 70, fc: 3.5 }, [], cell).items.find((i) => i.measure === "fc");
    expect(low?.detail).toBe("Set the chlorinator to about 20% (it needs to make about 1.9 ppm a day), or top up with liquid chlorine.");
    const high = adviseFor(swgPool, { ...balanced, cya: 70, fc: 7 }, [], cell).items.find((i) => i.measure === "fc");
    expect(high?.detail).toContain("Turn the chlorinator down to about 20%");
  });

  it("asks for the pump schedule when only that is missing", () => {
    const fc = adviseFor(swgPool, { ...balanced, cya: 70, fc: 5 }, [], { percent: null, needPpm: 1.86, missing: "pump" }).items.find((i) => i.measure === "fc");
    expect(fc?.detail).toContain("Add your pump schedule on the pool page");
  });

  it("asks for the cell's rating when it is unknown", () => {
    const fc = adviseFor(swgPool, { ...balanced, cya: 70, fc: 5 }, [], { percent: null, needPpm: 1.86 }).items.find((i) => i.measure === "fc");
    expect(fc?.detail).toContain("Add your cell's rated output on the pool page");
  });
});
