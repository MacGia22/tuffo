import { describe, expect, it } from "vitest";
import { placesFoundText, placesInOrder, visitorCountry } from "../place-order";

// The geocoder's order for "Melbourne" (by population).
const melbourne = [
  { label: "Melbourne, Victoria, Australia", country: "AU" },
  { label: "Melbourne, Florida, US", country: "US" },
  { label: "Melbourne, Arkansas, US", country: "US" },
  { label: "Melbourne, Iowa, US", country: "US" },
  { label: "Melbourne, Quebec, Canada", country: "CA" },
];

describe("placesInOrder", () => {
  it("lists Melbourne, Victoria first for a visitor in Australia", () => {
    expect(placesInOrder(melbourne, "AU").map((p) => p.label)).toEqual([
      "Melbourne, Victoria, Australia",
      "Melbourne, Florida, US",
      "Melbourne, Arkansas, US",
      "Melbourne, Iowa, US",
      "Melbourne, Quebec, Canada",
    ]);
  });

  it("lists Melbourne, FL first for a visitor in the US", () => {
    expect(placesInOrder(melbourne, "US")[0].label).toBe("Melbourne, Florida, US");
    expect(placesInOrder(melbourne, "US").at(-2)?.label).toBe("Melbourne, Victoria, Australia");
  });

  it("puts the visitor's country, then the US, then the rest", () => {
    expect(placesInOrder(melbourne, "CA").map((p) => p.country)).toEqual(["CA", "US", "US", "US", "AU"]);
  });

  it("puts US places first and keeps the geocoder's order otherwise when the country is unknown", () => {
    const places = [
      { label: "Naples, IT", country: "IT" },
      { label: "Naples, FL, US", country: "US" },
      { label: "Naples, ZA", country: "ZA" },
      { label: "Naples, NY, US", country: "US" },
    ];
    expect(placesInOrder(places).map((p) => p.label)).toEqual(["Naples, FL, US", "Naples, NY, US", "Naples, IT", "Naples, ZA"]);
  });

  it("reads the country header: two letters only", () => {
    expect(visitorCountry("AU")).toBe("AU");
    expect(visitorCountry("au")).toBe("AU");
    expect(visitorCountry(null)).toBeNull();
    expect(visitorCountry("")).toBeNull();
    expect(visitorCountry("XX")).toBeNull();
    expect(visitorCountry("AUS")).toBeNull();
  });

  it("announces how many places were found", () => {
    expect(placesFoundText(5)).toBe("5 places found");
    expect(placesFoundText(1)).toBe("1 place found");
    expect(placesFoundText(0)).toBe("No places found, try the nearest town or the ZIP code.");
  });
});
