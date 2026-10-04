import { describe, expect, it } from "vitest";
import { PUMP_MODELS } from "../equipment";
import { groupByRegion, regionForCountry, regionForTimeZone } from "../region";
import { SALT_CELLS } from "../salt-cells";

describe("region", () => {
  it("reads the region from the pool's time zone", () => {
    expect(regionForTimeZone("Australia/Melbourne")).toBe("AU");
    expect(regionForTimeZone("Pacific/Auckland")).toBe("AU");
    expect(regionForTimeZone("America/New_York")).toBe("US");
    expect(regionForTimeZone("Pacific/Honolulu")).toBe("US");
    expect(regionForTimeZone("Europe/Rome")).toBeNull();
    expect(regionForTimeZone(null)).toBeNull();
  });

  it("reads the region from a country code", () => {
    expect(regionForCountry("AU")).toBe("AU");
    expect(regionForCountry("nz")).toBe("AU");
    expect(regionForCountry("US")).toBe("US");
    expect(regionForCountry("IT")).toBeNull();
    expect(regionForCountry(null)).toBeNull();
  });

  it("lists an Australian pool's cells and pumps first, the rest after", () => {
    const cells = groupByRegion(SALT_CELLS, "AU");
    expect(cells.map((g) => g.label)).toEqual(["Common in Australia", "Other models"]);
    expect(cells[0].items[0].name).toBe("AstralPool E25");
    expect(cells[1].items[0].name).toBe("Hayward TurboCell T-15");
    expect(cells[0].items.length + cells[1].items.length).toBe(SALT_CELLS.length);

    const pumps = groupByRegion(PUMP_MODELS, "AU");
    expect(pumps[0].items.every((p) => p.region === "AU")).toBe(true);
    expect(pumps[0].items[0].name).toBe("Davey ProMaster PM200BT");

    const us = groupByRegion(PUMP_MODELS, "US");
    expect(us[0].label).toBe("Common in the US");
    expect(us[0].items[0].name).toBe("Pentair IntelliFlo3 VSF");
  });

  it("keeps the catalog order in one group without a region", () => {
    expect(groupByRegion(SALT_CELLS, null)).toEqual([{ label: null, items: SALT_CELLS }]);
  });
});
