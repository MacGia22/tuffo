import { describe, expect, it } from "vitest";
import { labelFor, nameVariants, parseQuery, rankResults, type GeoResult } from "../place-query";

const city: GeoResult = {
  name: "St. Petersburg",
  latitude: 27.7709,
  longitude: -82.6793,
  timezone: "America/New_York",
  country_code: "US",
  country: "United States",
  admin1: "Florida",
  feature_code: "PPL",
  population: 258308,
};

const airport: GeoResult = {
  name: "St Petersburg-Clearwater International Airport",
  latitude: 27.9102,
  longitude: -82.6874,
  timezone: "America/New_York",
  country_code: "US",
  country: "United States",
  admin1: "Florida",
  feature_code: "AIRP",
};

const russia: GeoResult = {
  name: "Saint Petersburg",
  latitude: 59.9386,
  longitude: 30.3141,
  timezone: "Europe/Moscow",
  country_code: "RU",
  country: "Russia",
  admin1: "St.-Petersburg",
  feature_code: "PPLA",
  population: 5351935,
};

describe("parseQuery", () => {
  it("splits town and state and tries Saint/St. spellings", () => {
    const q = parseQuery("st petersburg, fl");
    expect(q.qualifier).toBe("fl");
    expect(q.postal).toBe(false);
    expect(q.names).toEqual(["st petersburg", "Saint petersburg", "St. petersburg"]);
  });

  it("recognises postal codes", () => {
    expect(parseQuery("33710")).toEqual({ names: ["33710"], qualifier: null, postal: true });
    expect(parseQuery("SW1A 1AA")).toMatchObject({ postal: true });
    expect(parseQuery("Milano").postal).toBe(false);
  });

  it("keeps a plain town as is", () => {
    expect(parseQuery("Tampa")).toEqual({ names: ["Tampa"], qualifier: null, postal: false });
    expect(nameVariants("Port St Lucie")).toContain("Port Saint Lucie");
  });
});

describe("rankResults", () => {
  it("prefers the town over the airport and applies the state", () => {
    const ranked = rankResults([airport, russia, city], "fl");
    expect(ranked.map((r) => r.name)).toEqual(["St. Petersburg"]);
  });

  it("puts the bigger town first without a qualifier and drops airports when towns exist", () => {
    const ranked = rankResults([airport, city, russia], null);
    expect(ranked.map((r) => r.name)).toEqual(["Saint Petersburg", "St. Petersburg"]);
  });

  it("falls back to everything when the qualifier matches nothing", () => {
    const ranked = rankResults([city], "texas");
    expect(ranked).toHaveLength(1);
  });

  it("accepts a country as qualifier and dedupes repeated coordinates", () => {
    const ranked = rankResults([russia, { ...russia }, city], "russia");
    expect(ranked).toHaveLength(1);
    expect(ranked[0].country_code).toBe("RU");
  });

  it("shows the airport only when nothing better exists", () => {
    expect(rankResults([airport], "fl").map((r) => r.feature_code)).toEqual(["AIRP"]);
  });
});

describe("labelFor", () => {
  it("writes US places with the state and country code", () => {
    expect(labelFor(city)).toBe("St. Petersburg, Florida, US");
    expect(labelFor(russia)).toBe("Saint Petersburg, St.-Petersburg, Russia");
  });
});
