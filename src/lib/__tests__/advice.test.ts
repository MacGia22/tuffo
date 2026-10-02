import { describe, expect, it } from "vitest";
import { doseFor, doseForPh } from "@/engine/server";
import { NEVER_MIX_NOTE, adviseFor, type AdviceReading, type LoggedDose } from "../advice";

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
    // The engine's default CYA (40), the same the plan and the pools list use.
    expect(advice.assumptions[0]).toBe("No stabilizer (CYA) test yet; targets assume 40 ppm.");
    expect(advice.targets.fc.targetLow).toBe(5); // CYA 40 row: 5–7
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
    // 77% calcium chloride raises CH by 0.77 × 100.09/110.98 × 1000 = 694.4 mg per gram per liter:
    // 100 × 56,781 / 694.4 ≈ 8,177 g (18.0 lb).
    const before = adviseFor(pool, { ...balanced, ch: 200 }).items.find((i) => i.measure === "ch");
    expect(before?.dose?.amount).toBeGreaterThan(8_150);
    expect(before?.dose?.amount).toBeLessThan(8_200);

    // 10 lb (4,536 g) adds 4,536 × 694.4 / 56,781 ≈ 55.5 ppm: CH about 255, in range.
    const tenLb: LoggedDose = { productId: "calcium-chloride-77", amount: 4535.9, amountText: "10 lb", dateText: "Sep 29" };
    const after = adviseFor(pool, { ...balanced, ch: 200 }, [tenLb]).items.find((i) => i.measure === "ch");
    expect(after?.title).toBe("Calcium about 255 ppm is in range");
    expect(after?.severity).toBe("ok");
    expect(after?.detail).toContain("Counts your 10 lb from Sep 29.");
    expect(after?.dose).toBeUndefined();

    // 5 lb adds about 27.7 ppm: 228, still low, but no second dose until a retest.
    const fiveLb: LoggedDose = { ...tenLb, amount: 2268, amountText: "5 lb" };
    const partial = adviseFor(pool, { ...balanced, ch: 200 }, [fiveLb]).items.find((i) => i.measure === "ch");
    expect(partial?.title).toBe("Calcium about 228 ppm is still low");
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

describe("adviseFor with values from different tests", () => {
  const tenK = { volumeL: 37_854, sanitizer: "chlorine" as const, surface: "plaster" as const }; // 10,000 gal
  const lb = (productId: string, addedAt: string, grams = 453.592): LoggedDose => ({
    productId,
    amount: grams,
    amountText: "1 lb",
    dateText: addedAt.slice(5, 10),
    addedAt,
  });

  it("sets the chlorine targets from last week's CYA, not a default", () => {
    // Today's test: FC 3.0, pH 7.5. Last week: CYA 60 (FC/CYA chart: min 5, target 7–9).
    const advice = adviseFor(
      tenK,
      { ...balanced, fc: 3, cya: 60, ta: 120 },
      [],
      undefined,
      { testedAt: "2026-10-01T16:00:00Z", valueTestedAt: { cya: "2026-09-24T16:00:00Z", ta: "2026-09-24T16:00:00Z" } },
    );
    expect(advice.targets.fc).toMatchObject({ min: 5, targetLow: 7, targetHigh: 9 });
    expect(advice.assumptions).toEqual([]);
    const fc = advice.items.find((i) => i.measure === "fc")!;
    expect(fc.title).toBe("Free chlorine 3.0 ppm is below the minimum of 5 ppm");
    // Up to the middle of 7–9: +5 ppm × 37,854 L / 125 mg/mL ≈ 1,514 mL.
    expect(fc.dose?.amount).toBeCloseTo((5 * 37_854) / 125, 0);
  });

  it("counts each product from the test its measure came from", () => {
    // CYA tested Sep 20 (40); stabilizer added Sep 25; chlorine added Sep 28; FC tested Oct 1.
    const doses = [lb("cyanuric-acid", "2026-09-25T20:00:00Z"), { ...lb("liquid-chlorine-12.5", "2026-09-28T22:00:00Z", 946), amountText: "1 qt" }];
    const advice = adviseFor(tenK, { ...balanced, fc: 5.5, cya: 20 }, doses, undefined, {
      testedAt: "2026-10-01T16:00:00Z",
      valueTestedAt: { cya: "2026-09-20T16:00:00Z" },
    });
    // The chlorine went in before today's FC test: no "retest before adding more".
    expect(advice.items.find((i) => i.measure === "fc")?.title).not.toContain("Retest");
    // The stabilizer went in after the CYA test: counted (20 + ~12 = ~32 ppm, inside 30–50).
    const cya = advice.items.find((i) => i.measure === "cya")!;
    expect(cya.title).toBe("Stabilizer about 32 ppm is in range");
  });

  it("gives no dose card for a slow measure past its retest age, but keeps its value for targets", () => {
    const advice = adviseFor(tenK, { ...balanced, ch: 150, cya: 60 }, [], undefined, {
      testedAt: "2026-10-01T16:00:00Z",
      valueTestedAt: { ch: "2026-08-01T16:00:00Z", cya: "2026-08-01T16:00:00Z" },
      stale: { ch: true, cya: true },
    });
    expect(advice.items.find((i) => i.measure === "ch")).toBeUndefined();
    expect(advice.items.find((i) => i.measure === "cya")).toBeUndefined();
    expect(advice.targets.fc.targetLow).toBe(7);
    // Nor a saturation card from an old calcium test; the index itself stays for the line under the tiles.
    expect(advice.items.find((i) => i.measure === "csi")).toBeUndefined();
    expect(advice.csi).not.toBeNull();
    expect(adviseFor(tenK, { ...balanced, ch: 150, cya: 60 }).items.find((i) => i.measure === "csi")).toBeDefined();
  });

  it("reads free chlorine from its own test when the latest one is pH only", () => {
    // FC 1.0 yesterday, chlorine added after it, today's test pH only: retest, not a second dose.
    const chlorine = { ...lb("liquid-chlorine-12.5", "2026-09-30T22:00:00Z", 946), amountText: "1 qt" };
    const advice = adviseFor(tenK, { ...balanced, fc: 1 }, [chlorine], undefined, {
      testedAt: "2026-10-01T16:00:00Z",
      valueTestedAt: { fc: "2026-09-30T16:00:00Z" },
    });
    expect(advice.items.find((i) => i.measure === "fc")?.title).toBe("Retest free chlorine before adding more");
    // A week-old free chlorine gives no card: the test card asks for a test.
    const old = adviseFor(tenK, { ...balanced, fc: 1 }, [], undefined, { stale: { fc: true } });
    expect(old.items.find((i) => i.measure === "fc")).toBeUndefined();
  });

  it("does not count cal-hypo's calcium as a calcium addition", () => {
    // CH 200 on plaster, then 1 lb of cal-hypo 73% (+8.75 FC, +~6 CH): calcium chloride is still advised.
    const advice = adviseFor(tenK, { ...balanced, ch: 200 }, [lb("cal-hypo-73", "2026-10-01T20:00:00Z")], undefined, {
      testedAt: "2026-10-01T16:00:00Z",
    });
    const ch = advice.items.find((i) => i.measure === "ch")!;
    expect(ch).toMatchObject({ severity: "act", title: "Calcium 200 ppm is low" });
    expect(ch.dose?.productId).toBe("calcium-chloride-77");
    // Its calcium comes off the dose: 300 − 200 − 8.75 × 0.705 = 93.8 ppm, × 37,854 L ÷ 694.4 mg/g = 5,115 g.
    expect(ch.dose!.amount).toBeCloseTo(5115, -1);
    expect(ch.detail).toContain("counts about 6 ppm from the cal-hypo added since");
    // Ten pounds (+62 ppm) covers CH 240 to 300: no calcium card.
    const lots = adviseFor(tenK, { ...balanced, ch: 240 }, [lb("cal-hypo-73", "2026-10-01T20:00:00Z", 4536)], undefined, {
      testedAt: "2026-10-01T16:00:00Z",
    });
    expect(lots.items.find((i) => i.measure === "ch")).toBeUndefined();
  });

  it("counts the soda ash for pH in the baking soda for TA", () => {
    // pH 7.0 and TA 50 in 10,000 gal: soda ash to pH 7.5 adds TA; baking soda makes up the rest to 70.
    const reading = { ...balanced, ph: 7.0, ta: 50, cya: 40 };
    const advice = adviseFor(tenK, reading);
    const soda = doseForPh("soda-ash", { pH: 7.0, ta: 50, cya: 40, liters: 37_854, targetPh: 7.5 });
    const fromSoda = soda.effects.ta!;
    expect(fromSoda).toBeGreaterThan(5);
    const ta = advice.items.find((i) => i.measure === "ta")!;
    expect(ta.dose?.productId).toBe("baking-soda");
    expect(ta.dose?.amount).toBeCloseTo(doseFor("baking-soda", 70 - (50 + fromSoda), 37_854).amount, 3);
    expect(ta.detail).toContain(`about ${Math.round(50 + fromSoda)} ppm after it`);
    // When the soda ash alone gets there, no baking soda.
    const close = adviseFor(tenK, { ...reading, ph: 6.8, ta: 58 });
    const closeTa = close.items.find((i) => i.measure === "ta")!;
    expect(closeTa.dose).toBeUndefined();
    expect(closeTa.detail).toMatch(/^The soda ash for pH brings it to about \d+ ppm; retest it a day after\.$/);
  });

  it("treats combined chlorine of 0.5 as fine, above it as worth watching", () => {
    expect(adviseFor(pool, { ...balanced, cc: 0.5 }).items.find((i) => i.measure === "cc")).toBeUndefined();
    expect(adviseFor(pool, { ...balanced, cc: 0.6 }).items.find((i) => i.measure === "cc")?.severity).toBe("watch");
  });

  it("returns the saturation index it shows, for the line under the tiles", () => {
    const advice = adviseFor(pool, { ...balanced, borate: 50 });
    const card = advice.items.find((i) => i.measure === "csi")!;
    expect(card.title).toContain(advice.csi!.value.toFixed(2).replace(/^(?=\d)/, "+"));
    expect(advice.csi).toMatchObject({ assumedTemp: false });
    expect(adviseFor(pool, { ...balanced, waterTempC: null }).assumptions).toContain(
      "No water temperature; the saturation index assumes 27 °C (81 °F).",
    );
  });
});

describe("chlorine safety", () => {
  const tenK = { volumeL: 37_854, sanitizer: "chlorine" as const, surface: "plaster" as const };

  it("adds at most 8 ppm of chlorine at once and says to retest for the rest", () => {
    // CYA 100, FC 0: the aim is above 8 ppm, so the dose stops at 8 ppm (worked: 8 × 37,854 L ÷ 125 g/L ≈ 2,423 mL).
    const advice = adviseFor(tenK, { ...balanced, fc: 0, cya: 100 });
    const fc = advice.items.find((i) => i.measure === "fc")!;
    const aim = (advice.targets.fc.targetLow + advice.targets.fc.targetHigh) / 2;
    expect(aim).toBeGreaterThan(8);
    expect(fc.dose!.effects.fc).toBeCloseTo(8, 5);
    expect(fc.dose!.amount).toBeCloseTo(2423, -1);
    expect(fc.dose!.notes.some((n) => n.includes("the most in one addition"))).toBe(true);
    // Below the cap nothing changes: FC 3 at CYA 40 gets its whole way to the aim.
    const small = adviseFor(tenK, { ...balanced, fc: 1, cya: 40 }).items.find((i) => i.measure === "fc")!;
    expect(small.dose!.notes.some((n) => n.includes("the most in one addition"))).toBe(false);
  });

  it("puts the never-mix note on every dose", () => {
    const advice = adviseFor(tenK, { ...balanced, fc: 1, ph: 8.0, ch: 150 });
    const doses = advice.items.filter((i) => i.dose);
    expect(doses.length).toBeGreaterThanOrEqual(2);
    for (const item of doses) expect(item.dose!.notes).toContain(NEVER_MIX_NOTE);
  });
});
