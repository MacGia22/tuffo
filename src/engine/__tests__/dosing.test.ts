import { describe, expect, it } from "vitest";
import { doseFor, doseForPh, effectsOf, pHAfter } from "../dosing";
import { flOzToMl, gallonsToLiters, mlToFlOz, poundsToGrams } from "../units";

const TEN_K_GAL = gallonsToLiters(10_000);
const ONE_LB = poundsToGrams(1);
const ONE_GAL_ML = gallonsToLiters(1) * 1000;

describe("chlorine products in a 10,000 gallon pool", () => {
  it("one gallon of 12.5% liquid chlorine raises FC by 12.5 ppm", () => {
    const fx = effectsOf("liquid-chlorine-12.5", ONE_GAL_ML, TEN_K_GAL);
    expect(fx.fc).toBeCloseTo(12.5, 1);
  });

  it("one pound of 73% cal-hypo raises FC by about 8.8 ppm and CH by about 6 ppm", () => {
    const fx = effectsOf("cal-hypo-73", ONE_LB, TEN_K_GAL);
    expect(fx.fc).toBeCloseTo(8.75, 1);
    expect(fx.ch).toBeGreaterThan(5.8);
    expect(fx.ch).toBeLessThan(6.5);
  });

  it("one pound of trichlor raises FC by about 10.8 ppm, CYA by about 6.5 ppm and lowers TA", () => {
    const fx = effectsOf("trichlor-90", ONE_LB, TEN_K_GAL);
    expect(fx.fc).toBeCloseTo(10.78, 1);
    expect(fx.cya).toBeCloseTo(6.5, 0);
    expect(fx.ta).toBeLessThan(-7);
  });

  it("one pound of dichlor raises FC by about 6.7 ppm and CYA by about 6.1 ppm", () => {
    const fx = effectsOf("dichlor-56", ONE_LB, TEN_K_GAL);
    expect(fx.fc).toBeCloseTo(6.7, 1);
    expect(fx.cya).toBeCloseTo(6.1, 0);
  });

  it("raising FC by 3 ppm needs about 31 fl oz of 12.5% liquid chlorine", () => {
    const dose = doseFor("liquid-chlorine-12.5", 3, TEN_K_GAL);
    expect(dose.unit).toBe("mL");
    expect(mlToFlOz(dose.amount)).toBeCloseTo(30.7, 0);
    expect(dose.effects.fc).toBeCloseTo(3, 5);
  });

  it("a zero or negative request returns an empty dose", () => {
    expect(doseFor("liquid-chlorine-12.5", 0, TEN_K_GAL).amount).toBe(0);
    expect(doseFor("liquid-chlorine-12.5", -2, TEN_K_GAL).amount).toBe(0);
  });
});

describe("balance products in a 10,000 gallon pool", () => {
  it("one pound of baking soda raises TA by about 7.1 ppm", () => {
    expect(effectsOf("baking-soda", ONE_LB, TEN_K_GAL).ta).toBeCloseTo(7.1, 1);
  });

  it("one pound of soda ash adds about 11.3 ppm of alkalinity", () => {
    expect(effectsOf("soda-ash", ONE_LB, TEN_K_GAL).ta).toBeCloseTo(11.3, 1);
  });

  it("one pound of 97% calcium chloride raises CH by about 10.5 ppm, the dihydrate by about 8.2 ppm", () => {
    expect(effectsOf("calcium-chloride-97", ONE_LB, TEN_K_GAL).ch).toBeCloseTo(10.5, 0);
    expect(effectsOf("calcium-chloride-77", ONE_LB, TEN_K_GAL).ch).toBeCloseTo(8.2, 1);
  });

  it("one pound of stabilizer raises CYA by 12 ppm and one pound of salt raises salt by 12 ppm", () => {
    expect(effectsOf("cyanuric-acid", ONE_LB, TEN_K_GAL).cya).toBeCloseTo(12, 0);
    expect(effectsOf("salt", ONE_LB, TEN_K_GAL).salt).toBeCloseTo(12, 0);
  });

  it("one fluid ounce of muriatic acid lowers TA by about 0.39 ppm", () => {
    expect(effectsOf("muriatic-acid-31.45", flOzToMl(1), TEN_K_GAL).ta).toBeCloseTo(-0.39, 2);
  });

  it("raising CH by 50 ppm asks for about 4.8 pounds of 97% calcium chloride", () => {
    const dose = doseFor("calcium-chloride-97", 50, TEN_K_GAL);
    expect(dose.unit).toBe("g");
    expect(dose.amount / ONE_LB).toBeCloseTo(4.8, 0);
  });
});

describe("pH dosing with the carbonate model", () => {
  const water = { liters: TEN_K_GAL, pH: 7.8, ta: 80, cya: 40 };

  it("lowering pH from 7.8 to 7.4 at TA 80 needs roughly 11 to 15 fl oz of muriatic acid", () => {
    const dose = doseForPh("muriatic-acid-31.45", { ...water, targetPh: 7.4 });
    const flOz = mlToFlOz(dose.amount);
    expect(flOz).toBeGreaterThan(11);
    expect(flOz).toBeLessThan(15);
    expect(dose.effects.ta).toBeLessThan(0);
    expect(dose.effects.ta).toBeGreaterThan(-8);
  });

  it("the acid dose lands on the target pH when added back", () => {
    const dose = doseForPh("muriatic-acid-31.45", { ...water, targetPh: 7.4 });
    expect(pHAfter("muriatic-acid-31.45", dose.amount, water)).toBeCloseTo(7.4, 2);
  });

  it("more buffering (higher TA) needs more acid for the same pH move", () => {
    const low = doseForPh("muriatic-acid-31.45", { ...water, ta: 60, targetPh: 7.4 });
    const high = doseForPh("muriatic-acid-31.45", { ...water, ta: 120, targetPh: 7.4 });
    expect(high.amount).toBeGreaterThan(low.amount * 1.5);
  });

  it("raising pH with soda ash lands on the target and raises TA", () => {
    const acidic = { liters: TEN_K_GAL, pH: 7.0, ta: 60, cya: 30 };
    const dose = doseForPh("soda-ash", { ...acidic, targetPh: 7.5 });
    expect(dose.unit).toBe("g");
    expect(dose.amount).toBeGreaterThan(50);
    expect(dose.amount).toBeLessThan(900);
    expect(dose.effects.ta).toBeGreaterThan(0);
    expect(pHAfter("soda-ash", dose.amount, acidic)).toBeCloseTo(7.5, 2);
  });

  it("refuses the wrong kind of product for the direction of change", () => {
    expect(() => doseForPh("soda-ash", { ...water, targetPh: 7.4 })).toThrow();
    expect(() => doseForPh("muriatic-acid-31.45", { ...water, targetPh: 8.0 })).toThrow();
    expect(() => doseForPh("baking-soda", { ...water, targetPh: 7.4 })).toThrow();
  });
});
