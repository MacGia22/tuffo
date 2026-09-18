import { describe, expect, it } from "vitest";
import { adviseFor, type AdviceReading } from "../advice";

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
});
