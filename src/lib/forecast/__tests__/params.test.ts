import { describe, expect, it } from "vitest";
import {
  cleanPlace,
  defaultUnits,
  defaultVolumeL,
  forecastHref,
  parseForecastParams,
  signupHref,
  type ForecastInput,
} from "../params";

const tampa = { place: "Tampa, Florida, US", lat: "27.96", lon: "-82.47" };

describe("parseForecastParams", () => {
  it("needs a place: nothing asked is no forecast, a broken place is an error", () => {
    expect(parseForecastParams({})).toEqual({ ok: false, reason: "no-place" });
    expect(parseForecastParams({ lat: "27.96", lon: "-82.47" })).toEqual({ ok: false, reason: "bad-place" });
    expect(parseForecastParams({ place: "Tampa", lat: "x", lon: "-82.47" })).toEqual({ ok: false, reason: "bad-place" });
    expect(parseForecastParams({ place: "Tampa", lat: "95", lon: "-82.47" })).toEqual({ ok: false, reason: "bad-place" });
    expect(parseForecastParams({ place: " ", lat: "27.96", lon: "-82.47" })).toEqual({ ok: false, reason: "bad-place" });
  });

  it("uses the defaults: 15,000 gal, CYA 40, chlorine, US units for a US place", () => {
    const r = parseForecastParams(tampa);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 15,000 × 3.785411784 = 56,781.2 L
    expect(r.input).toEqual({
      place: "Tampa, Florida, US",
      lat: 27.96,
      lon: -82.47,
      volumeL: 56_781,
      cya: 40,
      sanitizer: "chlorine",
      units: "us",
    });
    expect(r.notices).toEqual([]);
    expect(r.canonical).toBeNull();
  });

  it("uses metric and 57,000 L outside the US, and the toggle wins", () => {
    const r = parseForecastParams({ place: "Bari, Apulia, Italy", lat: "41.13", lon: "16.86" });
    expect(r.ok && r.input.units).toBe("metric");
    expect(r.ok && r.input.volumeL).toBe(57_000);
    const us = parseForecastParams({ ...tampa, u: "metric" });
    expect(us.ok && us.input.units).toBe("metric");
  });

  it("reads volume, CYA and salt", () => {
    const r = parseForecastParams({ ...tampa, v: "75,000", cya: "70.4", s: "salt" });
    expect(r.ok && r.input).toMatchObject({ volumeL: 75_000, cya: 70, sanitizer: "salt" });
  });

  it("falls back with a notice on bad numbers and out-of-range volume or CYA", () => {
    const bad = parseForecastParams({ ...tampa, v: "lots", cya: "abc" });
    expect(bad.ok && bad.input.volumeL).toBe(56_781);
    expect(bad.ok && bad.input.cya).toBe(40);
    expect(bad.ok && bad.notices).toEqual([
      "The pool volume was not a number; using 15,000 gal.",
      "Stabilizer (CYA) must be a number from 0 to 100 ppm; using 40.",
    ]);
    const small = parseForecastParams({ ...tampa, v: "500", cya: "150" });
    expect(small.ok && small.input).toMatchObject({ volumeL: 56_781, cya: 40 });
    expect(small.ok && small.notices[0]).toBe("Pool volume must be between 300 gal and 264,200 gal; using 15,000 gal.");
    const big = parseForecastParams({ ...tampa, v: "2000000", cya: "-5" });
    expect(big.ok && big.input).toMatchObject({ volumeL: 56_781, cya: 40 });
    expect(big.ok && big.notices).toHaveLength(2);
  });

  it("treats an unknown sanitizer as chlorine", () => {
    const r = parseForecastParams({ ...tampa, s: "bromine" });
    expect(r.ok && r.input.sanitizer).toBe("chlorine");
  });

  it("snaps a precise point to the weather cell and asks for a redirect", () => {
    const r = parseForecastParams({ ...tampa, lat: "27.9506", lon: "-82.4572", v: "abc", ref: "pools" });
    expect(r.ok && r.input.lat).toBe(27.96);
    expect(r.ok && r.input.lon).toBe(-82.47);
    // Everything else stays as it was, so the page can still say what was wrong.
    expect(r.ok && r.canonical).toBe("/forecast?place=Tampa%2C+Florida%2C+US&lat=27.96&lon=-82.47&v=abc&ref=pools");
  });
});

describe("cleanPlace", () => {
  it("drops control characters and angle brackets, collapses spaces, caps the length", () => {
    expect(cleanPlace("  Tampa,\n  Florida <b>")).toBe("Tampa, Florida b");
    expect(cleanPlace("x".repeat(200))).toHaveLength(120);
    expect(cleanPlace("a")).toBeNull();
  });
});

describe("units", () => {
  it("US for places labeled US, metric elsewhere", () => {
    expect(defaultUnits("Tampa, Florida, US")).toBe("us");
    expect(defaultUnits("Toronto, Ontario, Canada")).toBe("metric");
    expect(defaultVolumeL("us")).toBe(56_781);
    expect(defaultVolumeL("metric")).toBe(57_000);
  });
});

describe("links", () => {
  const input: ForecastInput = {
    place: "Tampa, Florida, US",
    lat: 27.9506,
    lon: -82.4572,
    volumeL: 60_000,
    cya: 50,
    sanitizer: "salt",
    units: "us",
  };

  it("puts only the weather cell's center in the shareable link", () => {
    const href = forecastHref(input);
    expect(href).toBe("/forecast?place=Tampa%2C+Florida%2C+US&lat=27.96&lon=-82.47&v=60000&cya=50&s=salt");
    expect(href).not.toContain("27.9506");
    expect(forecastHref({ ...input, units: "metric" })).toContain("&u=metric");
    expect(forecastHref(input, { ref: "reddit-pools" })).toContain("&ref=reddit-pools");
  });

  it("sends sign-up to sign-in with the label, then the prefilled new-pool form", () => {
    const href = signupHref(input, { ref: null, timezone: "America/New_York" });
    const url = new URL(href, "https://tuffo.app");
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("ref")).toBe("forecast");
    const next = new URL(url.searchParams.get("next") ?? "", "https://tuffo.app");
    expect(next.pathname).toBe("/app/pools/new");
    expect(Object.fromEntries(next.searchParams)).toEqual({
      place: "Tampa, Florida, US",
      lat: "27.96",
      lon: "-82.47",
      tz: "America/New_York",
      v: "60000",
      cya: "50",
      s: "salt",
      u: "us",
    });
    expect(new URL(signupHref(input, { ref: "reddit-pools", timezone: null }), "https://tuffo.app").searchParams.get("ref")).toBe(
      "reddit-pools",
    );
  });
});
