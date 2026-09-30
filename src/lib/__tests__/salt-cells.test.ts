import { describe, expect, it } from "vitest";
import { cellFromForm, toLbPerDay } from "../salt-cells";

describe("salt cells", () => {
  it("lists CircuPool cells", () => {
    // CORE35: 1.4 lb/day in 15,000 gal = 1.4 × 453.6 × 1000 / 56,781 ≈ 11.2 ppm/day at 100%.
    expect(cellFromForm({ model: "circupool-core35", value: "", unit: "" })).toEqual({ ok: true, lbPerDay: 1.4, model: "CircuPool CORE35" });
  });

  it("takes a listed cell's rating", () => {
    expect(cellFromForm({ model: "pentair-ic40", value: "", unit: "" })).toEqual({ ok: true, lbPerDay: 1.4, model: "Pentair IntelliChlor IC40" });
  });

  it("converts a rating from the label", () => {
    // 25 g/h × 24 h = 600 g/day = 1.32 lb/day.
    expect(toLbPerDay(25, "g_hour")).toBeCloseTo(1.3228, 4);
    expect(cellFromForm({ model: "other", value: "25", unit: "g_hour" })).toEqual({ ok: true, lbPerDay: 1.32, model: "Other" });
    expect(cellFromForm({ model: "other", value: "0,6", unit: "kg_day" })).toEqual({ ok: true, lbPerDay: 1.32, model: "Other" });
    expect(cellFromForm({ model: "other", value: "1.5", unit: "lb_day" })).toEqual({ ok: true, lbPerDay: 1.5, model: "Other" });
  });

  it("refuses what no home cell makes, and missing input", () => {
    expect(cellFromForm({ model: "other", value: "25", unit: "lb_day" }).ok).toBe(false);
    expect(cellFromForm({ model: "other", value: "", unit: "lb_day" }).ok).toBe(false);
    expect(cellFromForm({ model: "made-up", value: "", unit: "" }).ok).toBe(false);
  });
});
