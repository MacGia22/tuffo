import { describe, expect, it } from "vitest";
import { unitsForBrowser, unitsForCountry } from "../browser-units";

describe("unitsForBrowser", () => {
  it("uses metric in an Australian time zone, whatever the language", () => {
    expect(unitsForBrowser({ timeZone: "Australia/Melbourne", language: "en-US" })).toBe("metric");
    expect(unitsForBrowser({ timeZone: "Australia/Perth", language: "en" })).toBe("metric");
  });

  it("uses metric when the language region is not the US", () => {
    expect(unitsForBrowser({ timeZone: "Europe/Rome", language: "it-IT" })).toBe("metric");
    expect(unitsForBrowser({ timeZone: "America/Toronto", language: "en-CA" })).toBe("metric");
    expect(unitsForBrowser({ timeZone: "UTC", language: "en_GB" })).toBe("metric");
  });

  it("keeps US units for en-US, a language with no region, or nothing known", () => {
    expect(unitsForBrowser({ timeZone: "America/New_York", language: "en-US" })).toBe("us");
    expect(unitsForBrowser({ timeZone: "America/Chicago", language: "en" })).toBe("us");
    expect(unitsForBrowser({})).toBe("us");
    // A script subtag is not a region.
    expect(unitsForBrowser({ timeZone: "America/Los_Angeles", language: "zh-Hant" })).toBe("us");
  });
});

describe("unitsForCountry", () => {
  it("uses US units in the US, metric elsewhere, nothing for an unknown country", () => {
    expect(unitsForCountry("US")).toBe("us");
    expect(unitsForCountry("AU")).toBe("metric");
    expect(unitsForCountry("gb")).toBe("metric");
    expect(unitsForCountry("")).toBeNull();
    expect(unitsForCountry(undefined)).toBeNull();
  });
});
