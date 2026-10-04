import { describe, expect, it } from "vitest";
import { DEFAULT_SALT_TARGET } from "@/engine/server";
import {
  cellFromForm,
  cellLevelCount,
  cellLevels,
  cellLevelsFromForm,
  cellScaleLevels,
  cellSettingText,
  DEFAULT_SALT_TARGET_PPM,
  levelsText,
  levelToPercent,
  parseSaltTarget,
  poolSaltTarget,
  SALT_CELLS,
  saltTargetText,
  toLbPerDay,
} from "../salt-cells";

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

describe("cellLevels", () => {
  it("knows the settings of listed cells", () => {
    expect(cellLevels("CircuPool CORE35")).toEqual([25, 50, 75, 100]);
    expect(cellLevels("CircuPool EDGE40")).toHaveLength(8);
    expect(cellLevels("Pentair IntelliChlor IC40")).toEqual([20, 40, 60, 80, 100]);
  });

  it("is null for cells set in 5% steps and for other cells", () => {
    expect(cellLevels("Hayward TurboCell T-15")).toBeNull();
    expect(cellLevels("CircuPool RJ-60 Plus")).toBeNull();
    expect(cellLevels("Other")).toBeNull();
    expect(cellLevels(null)).toBeNull();
  });
});

describe("levelsText", () => {
  it("lists the settings in words", () => {
    expect(levelsText([25, 50, 75, 100])).toBe("25%, 50%, 75% or 100%");
    expect(levelsText(null)).toBeNull();
  });
});

describe("salt target", () => {
  it("reads a range or one number (±10%)", () => {
    expect(parseSaltTarget("")).toEqual({ ok: true, target: null });
    expect(parseSaltTarget("6000")).toEqual({ ok: true, target: { low: 5400, high: 6600 } });
    expect(parseSaltTarget("1,500 ppm")).toEqual({ ok: true, target: { low: 1350, high: 1650 } });
    expect(parseSaltTarget("2700-3400")).toEqual({ ok: true, target: { low: 2700, high: 3400 } });
    expect(parseSaltTarget("3,000 – 3,500")).toEqual({ ok: true, target: { low: 3000, high: 3500 } });
    expect(parseSaltTarget("4000 to 5000")).toEqual({ ok: true, target: { low: 4000, high: 5000 } });
    // Reversed is still a range.
    expect(parseSaltTarget("3400-2700")).toEqual({ ok: true, target: { low: 2700, high: 3400 } });
  });

  it("refuses numbers outside 500–10,000 ppm and nonsense", () => {
    expect(parseSaltTarget("4").ok).toBe(false);
    expect(parseSaltTarget("12000").ok).toBe(false);
    expect(parseSaltTarget("3000-3000").ok).toBe(false);
    expect(parseSaltTarget("lots").ok).toBe(false);
    expect(parseSaltTarget("1-2-3").ok).toBe(false);
  });

  it("uses the pool's own range, else the listed cell's, else none (the engine's default)", () => {
    expect(poolSaltTarget({ salt_target_low_ppm: 5400, salt_target_high_ppm: 6600, swg_cell_model: "Other" })).toEqual({ low: 5400, high: 6600 });
    expect(poolSaltTarget({ swg_cell_model: "Hayward TurboCell T-15" })).toBeNull();
    // Before the migration the columns are absent.
    expect(poolSaltTarget({ swg_cell_model: null })).toBeNull();
    expect(saltTargetText({ low: 5400, high: 6600 })).toBe("5,400–6,600 ppm");
  });

  it("keeps the usual range in step with the engine", () => {
    expect(DEFAULT_SALT_TARGET_PPM).toEqual(DEFAULT_SALT_TARGET);
  });
});

describe("cell levels", () => {
  it("turns levels 1 to 8 into 12.5% steps for an Other cell only", () => {
    expect(cellScaleLevels("Other", 8)).toEqual([12.5, 25, 37.5, 50, 62.5, 75, 87.5, 100]);
    expect(cellScaleLevels("Other", null)).toBeNull();
    // A listed cell keeps its own settings.
    expect(cellScaleLevels("CircuPool CORE35", 8)).toEqual([25, 50, 75, 100]);
    expect(cellLevelCount("Other", 8)).toBe(8);
    expect(cellLevelCount("CircuPool CORE35", 8)).toBeNull();
    expect(cellLevelCount("Other", 1)).toBeNull();
  });

  it("words a setting as the control shows it", () => {
    expect(cellSettingText(62.5, 8)).toBe("level 5 of 8");
    expect(cellSettingText(60, 8)).toBe("level 5 of 8");
    expect(cellSettingText(5, 8)).toBe("level 1 of 8");
    expect(cellSettingText(100, 8)).toBe("level 8 of 8");
    expect(cellSettingText(60, null)).toBe("60%");
    expect(cellSettingText(37.5, null)).toBe("37.5%");
    expect(cellSettingText(0, 8)).toBe("off");
    expect(levelToPercent(5, 8)).toBe(62.5);
    expect(levelToPercent(1, 6)).toBe(16.5);
  });

  it("reads the levels choice from the cell form", () => {
    expect(cellLevelsFromForm("Other", "levels", "8")).toEqual({ ok: true, count: 8 });
    expect(cellLevelsFromForm("Other", "percent", "8")).toEqual({ ok: true, count: null });
    expect(cellLevelsFromForm("CircuPool CORE35", "levels", "8")).toEqual({ ok: true, count: null });
    expect(cellLevelsFromForm("Other", "levels", "1").ok).toBe(false);
    expect(cellLevelsFromForm("Other", "levels", "8.5").ok).toBe(false);
  });
});

describe("Australian cells (AstralPool)", () => {
  it("converts the published g/h to lb/day", () => {
    // 25 g/h × 24 h = 600 g/day = 1.32 lb/day; 42 g/h → 1,008 g/day = 2.22 lb/day.
    expect(cellFromForm({ model: "astralpool-e25", value: "", unit: "" })).toEqual({ ok: true, lbPerDay: 1.32, model: "AstralPool E25" });
    expect(cellFromForm({ model: "astralpool-vx11t", value: "", unit: "" })).toEqual({ ok: true, lbPerDay: 2.22, model: "AstralPool VX 11T" });
    expect(cellFromForm({ model: "astralpool-halo18", value: "", unit: "" })).toEqual({ ok: true, lbPerDay: 0.95, model: "AstralPool Halo Chlor 18G" });
  });

  it("uses the maker's salt level and levels 1 to 8", () => {
    expect(poolSaltTarget({ swg_cell_model: "AstralPool E25" })).toEqual({ low: 4000, high: 4800 });
    expect(poolSaltTarget({ swg_cell_model: "AstralPool Viron eQuilibrium EQ35" })).toEqual({ low: 3600, high: 4400 });
    // The pool's own range still wins (an E Series in cold water at 6,000 ppm).
    expect(poolSaltTarget({ swg_cell_model: "AstralPool E25", salt_target_low_ppm: 5400, salt_target_high_ppm: 6600 })).toEqual({ low: 5400, high: 6600 });
    expect(cellLevelCount("AstralPool E35", null)).toBe(8);
    expect(cellScaleLevels("AstralPool E35", null)).toEqual([12.5, 25, 37.5, 50, 62.5, 75, 87.5, 100]);
    expect(cellSettingText(62.5, cellLevelCount("AstralPool E35", null))).toBe("level 5 of 8");
    // Viron V series: control not published, so 5% steps and percent wording.
    expect(cellLevelCount("AstralPool Viron V25", null)).toBeNull();
    expect(cellScaleLevels("AstralPool Viron V25", null)).toBeNull();
  });

  it("has unique ids and names", () => {
    expect(new Set(SALT_CELLS.map((c) => c.id)).size).toBe(SALT_CELLS.length);
    expect(new Set(SALT_CELLS.map((c) => c.name)).size).toBe(SALT_CELLS.length);
  });
});
