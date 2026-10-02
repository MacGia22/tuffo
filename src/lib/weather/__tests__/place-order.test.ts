import { describe, expect, it } from "vitest";
import { placesFoundText, usFirst } from "../place-order";

describe("usFirst", () => {
  it("puts US places first and keeps the geocoder's order otherwise", () => {
    const places = [
      { label: "Naples, IT", country: "IT" },
      { label: "Naples, FL, US", country: "US" },
      { label: "Naples, ZA", country: "ZA" },
      { label: "Naples, NY, US", country: "US" },
    ];
    expect(usFirst(places).map((p) => p.label)).toEqual(["Naples, FL, US", "Naples, NY, US", "Naples, IT", "Naples, ZA"]);
  });

  it("announces how many places were found", () => {
    expect(placesFoundText(5)).toBe("5 places found");
    expect(placesFoundText(1)).toBe("1 place found");
    expect(placesFoundText(0)).toBe("No places found, try the nearest town or the ZIP code.");
  });
});
