import { describe, expect, it } from "vitest";
import { fcRange, targetsFor } from "../targets";

describe("free chlorine ranges by CYA", () => {
  it("matches the familiar chart rows for manually chlorinated pools", () => {
    expect(fcRange(30)).toEqual({ min: 2, targetLow: 4, targetHigh: 6, slam: 12 });
    expect(fcRange(40)).toEqual({ min: 3, targetLow: 5, targetHigh: 7, slam: 16 });
    expect(fcRange(50)).toEqual({ min: 4, targetLow: 6, targetHigh: 8, slam: 20 });
    expect(fcRange(80)).toEqual({ min: 6, targetLow: 9, targetHigh: 11, slam: 32 });
  });

  it("runs lower for saltwater chlorine generators", () => {
    expect(fcRange(70, { swg: true })).toEqual({ min: 3, targetLow: 4, targetHigh: 6, slam: 28 });
    expect(fcRange(80, { swg: true })).toEqual({ min: 4, targetLow: 5, targetHigh: 7, slam: 32 });
  });

  it("interpolates between chart rows and clamps outside them", () => {
    const mid = fcRange(45);
    expect(mid.min).toBeGreaterThanOrEqual(3);
    expect(mid.min).toBeLessThanOrEqual(4);
    expect(mid.targetLow).toBeGreaterThanOrEqual(5);
    expect(mid.targetLow).toBeLessThanOrEqual(6);
    expect(fcRange(150)).toEqual(fcRange(100));
    expect(fcRange(-5)).toEqual(fcRange(0));
  });

  it("never lets the SLAM level drop below 10 ppm", () => {
    expect(fcRange(0).slam).toBe(10);
    expect(fcRange(20).slam).toBe(10);
  });
});

describe("pool targets", () => {
  it("asks for calcium on plaster but not on vinyl", () => {
    expect(targetsFor({ cya: 40, surface: "plaster" }).ch.low).toBe(250);
    expect(targetsFor({ cya: 40, surface: "vinyl" }).ch.low).toBe(100);
  });

  it("gives salt pools a salt range and a higher CYA band", () => {
    const salt = targetsFor({ cya: 70, swg: true });
    expect(salt.salt).toBeDefined();
    expect(salt.cya.low).toBe(60);
    expect(targetsFor({ cya: 40 }).salt).toBeUndefined();
  });
});
