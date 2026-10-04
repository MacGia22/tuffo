import { describe, expect, it } from "vitest";
import { basicsFromForm, describeEquipment, equipmentFromForm, pumpScheduleUnit, PUMP_MODELS } from "../equipment";

const form = (fields: Record<string, string>) => (name: string) => fields[name] ?? null;

describe("equipmentFromForm", () => {
  it("takes a listed pump with its speed type", () => {
    expect(equipmentFromForm("pump", form({ catalog: "pentair-intelliflo-vsf" }))).toEqual({
      ok: true,
      kind: "pump",
      model: "Pentair IntelliFlo VSF",
      details: { speed: "variable", catalog: "pentair-intelliflo-vsf" },
    });
  });

  it("takes another pump with a typed name and speed type", () => {
    expect(equipmentFromForm("pump", form({ catalog: "other", model: "  Old  Sta-Rite ", speed: "single" }))).toEqual({
      ok: true,
      kind: "pump",
      model: "Old Sta-Rite",
      details: { speed: "single", catalog: null },
    });
    expect(equipmentFromForm("pump", form({ catalog: "other" })).ok).toBe(false);
    expect(equipmentFromForm("pump", form({})).ok).toBe(false);
  });

  it("records a feeder with its setting", () => {
    expect(equipmentFromForm("feeder", form({ type: "inline", model: "Hayward CL200", setting: "3" }))).toEqual({
      ok: true,
      kind: "feeder",
      model: "Hayward CL200",
      details: { type: "inline", setting: "3" },
    });
    expect(equipmentFromForm("feeder", form({ type: "bucket" })).ok).toBe(false);
  });

  it("records a filter and a heater", () => {
    expect(equipmentFromForm("filter", form({ type: "cartridge" }))).toMatchObject({ ok: true, model: null, details: { type: "cartridge" } });
    expect(equipmentFromForm("heater", form({ type: "heat_pump", in_use: "on" }))).toMatchObject({
      ok: true,
      details: { type: "heat_pump", inUse: true },
    });
    expect(equipmentFromForm("heater", form({ type: "gas" }))).toMatchObject({ details: { inUse: false } });
  });

  it("caps long names", () => {
    const r = equipmentFromForm("filter", form({ type: "sand", model: "x".repeat(200) }));
    expect(r.ok && r.model?.length).toBe(80);
  });
});

describe("describeEquipment", () => {
  it("reads like a line on the settings page", () => {
    expect(describeEquipment("pump", "Pentair IntelliFlo VSF", { speed: "variable", catalog: "pentair-intelliflo-vsf" })).toBe(
      "Pentair IntelliFlo VSF",
    );
    expect(describeEquipment("pump", "Old Sta-Rite", { speed: "single", catalog: null })).toBe("Old Sta-Rite, single speed");
    expect(describeEquipment("feeder", "Hayward CL200", { type: "inline", setting: "3" })).toBe(
      "Inline tablet chlorinator, Hayward CL200, set to 3",
    );
    expect(describeEquipment("filter", null, { type: "de" })).toBe("DE (diatomaceous earth) filter");
    expect(describeEquipment("heater", null, { type: "gas", inUse: false })).toBe("Gas, not in use");
  });
});

describe("pumpScheduleUnit", () => {
  it("knows which pumps are usually set in GPM", () => {
    expect(pumpScheduleUnit({ catalog: "pentair-intelliflo3-vsf" })).toBe("gpm");
    expect(pumpScheduleUnit({ catalog: "hayward-tristar-vs-950" })).toBe("rpm");
    expect(pumpScheduleUnit({ catalog: null })).toBeNull();
    expect(pumpScheduleUnit(null)).toBeNull();
  });

  it("has unique ids", () => {
    expect(new Set(PUMP_MODELS.map((p) => p.id)).size).toBe(PUMP_MODELS.length);
  });
});

describe("basicsFromForm", () => {
  const base = { name: "Backyard", volume: "15,000", units: "us", sanitizer: "swg", surface: "plaster" };

  it("converts gallons to liters", () => {
    expect(basicsFromForm(form(base))).toEqual({
      ok: true,
      name: "Backyard",
      volumeL: 56781,
      sanitizer: "swg",
      surface: "plaster",
      covered: false,
    });
  });

  it("keeps liters and reads the cover box", () => {
    const r = basicsFromForm(form({ ...base, volume: "50000", units: "metric", covered: "on" }));
    expect(r).toMatchObject({ ok: true, volumeL: 50000, covered: true });
  });

  it("refuses a missing name, odd volumes and unknown options", () => {
    expect(basicsFromForm(form({ ...base, name: " " })).ok).toBe(false);
    expect(basicsFromForm(form({ ...base, volume: "10" })).ok).toBe(false);
    expect(basicsFromForm(form({ ...base, sanitizer: "bromine" })).ok).toBe(false);
    expect(basicsFromForm(form({ ...base, surface: "steel" })).ok).toBe(false);
  });
});

describe("pump schedule unit, metric and Another pump", () => {
  it("sets a flow pump in L/min on a metric pool", () => {
    expect(pumpScheduleUnit({ catalog: "pentair-intelliflo3-vsf" }, "metric")).toBe("lpm");
    expect(pumpScheduleUnit({ catalog: "hayward-tristar-vs-950" }, "metric")).toBe("rpm");
  });

  it("keeps how Another pump is set", () => {
    const pump = equipmentFromForm("pump", (n) => ({ catalog: "other", speed: "variable", model: "Davey Silensor", unit: "level" })[n] ?? null);
    expect(pump).toMatchObject({ ok: true, details: { speed: "variable", catalog: null, unit: "level" } });
    expect(pumpScheduleUnit({ catalog: null, unit: "level" })).toBe("level");
    expect(pumpScheduleUnit({ catalog: null, unit: "nonsense" })).toBeNull();
  });
});

describe("Australian pumps", () => {
  it("sets the Davey ProMaster by its numbered dial and the preset pumps in RPM", () => {
    expect(pumpScheduleUnit({ catalog: "davey-promaster-pm200bt" }, "metric")).toBe("level");
    expect(pumpScheduleUnit({ catalog: "waterco-hydrostorm-eco-v-100" }, "metric")).toBe("rpm");
    expect(pumpScheduleUnit({ catalog: "astralpool-viron-p320-xt" }, "metric")).toBe("rpm");
    expect(equipmentFromForm("pump", (n) => (n === "catalog" ? "zodiac-flopro-e3" : null))).toMatchObject({
      ok: true,
      model: "Zodiac FloPro E3",
      details: { speed: "variable", catalog: "zodiac-flopro-e3" },
    });
  });
});
