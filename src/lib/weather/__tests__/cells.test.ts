import { describe, expect, it } from "vitest";
import { cellFor } from "../cells";

describe("cellFor", () => {
  it("snaps to the 0.05° grid", () => {
    // St. Petersburg, FL
    expect(cellFor(27.7676, -82.6403)).toEqual({ id: "27.75,-82.65", lat: 27.75, lon: -82.65 });
    expect(cellFor(27.774, -82.626)).toEqual({ id: "27.75,-82.65", lat: 27.75, lon: -82.65 });
  });

  it("keeps two decimals and never prints negative zero", () => {
    expect(cellFor(0.01, -0.01).id).toBe("0.00,0.00");
    expect(cellFor(45, 9).id).toBe("45.00,9.00");
  });

  it("wraps the antimeridian", () => {
    expect(cellFor(10, 179.99).lon).toBe(-180);
  });

  it("rejects bad input", () => {
    expect(() => cellFor(Number.NaN, 0)).toThrow();
    expect(() => cellFor(91, 0)).toThrow();
  });
});
