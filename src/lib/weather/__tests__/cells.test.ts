import { describe, expect, it } from "vitest";
import { cellBounds, cellFor, cellNear, cellsInView, wrapLon } from "../cells";

describe("cellFor", () => {
  it("snaps to the 0.03° grid", () => {
    // St. Petersburg, FL
    expect(cellFor(27.7676, -82.6403)).toEqual({ id: "27.78,-82.65", lat: 27.78, lon: -82.65 });
    expect(cellFor(27.79, -82.64)).toEqual({ id: "27.78,-82.65", lat: 27.78, lon: -82.65 });
    // 0.03° further east is the next cell.
    expect(cellFor(27.7676, -82.61).id).toBe("27.78,-82.62");
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

describe("cellBounds", () => {
  it("is the square 0.03° across around the center", () => {
    const [[s, w], [n, e]] = cellBounds({ lat: 27.78, lon: -82.65 });
    expect(s).toBeCloseTo(27.765, 6);
    expect(n).toBeCloseTo(27.795, 6);
    expect(w).toBeCloseTo(-82.665, 6);
    expect(e).toBeCloseTo(-82.635, 6);
  });
});

describe("cellsInView", () => {
  it("lists every cell overlapping the view", () => {
    // 0.06° × 0.06° around a cell center: 3 rows × 3 columns.
    const cells = cellsInView(27.75, -82.68, 27.81, -82.62)!;
    expect(cells).toHaveLength(9);
    expect(cells.map((c) => c.id)).toContain("27.78,-82.65");
    expect(new Set(cells.map((c) => c.id)).size).toBe(9);
  });

  it("gives up when zoomed out too far", () => {
    expect(cellsInView(20, -90, 30, -80)).toBeNull();
  });
});

describe("cellNear", () => {
  it("keeps picks close to the town", () => {
    expect(cellNear({ lat: 27.78, lon: -82.65 }, { lat: 27.77, lon: -82.64 })).toBe(true);
    expect(cellNear({ lat: 28.2, lon: -82.65 }, { lat: 27.77, lon: -82.64 })).toBe(false);
  });
});

describe("cellNear at the edges", () => {
  it("reaches the same number of squares on every side of the town", () => {
    const town = cellFor(27.96, -82.47);
    const reach = (dLat: number, dLon: number) => {
      let k = 0;
      while (cellNear(cellFor(town.lat + (k + 1) * dLat * 0.03, town.lon + (k + 1) * dLon * 0.03), town)) k += 1;
      return k;
    };
    expect([reach(1, 0), reach(-1, 0), reach(0, 1), reach(0, -1)]).toEqual([10, 10, 10, 10]);
  });

  it("works across the antimeridian", () => {
    expect(wrapLon(181.5)).toBeCloseTo(-178.5, 9);
    expect(wrapLon(-180)).toBe(-180);
    expect(wrapLon(179.97)).toBeCloseTo(179.97, 9);
    // Taveuni, Fiji (179.97): the square at 180°, numbered −180, is next door.
    expect(cellNear(cellFor(-16.8, 180), { lat: -16.8, lon: 179.97 })).toBe(true);
  });
});
