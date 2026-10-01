import { describe, expect, it } from "vitest";
import { fromParam, parseSaved, safeReturnTo, withoutSaved, withSaved } from "../return-to";

const POOL = "/app/pools/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ID = "11111111-1111-4111-8111-111111111111";

describe("safeReturnTo", () => {
  it("keeps paths inside the app", () => {
    expect(safeReturnTo(`${POOL}/maintenance`, "/app")).toBe(`${POOL}/maintenance`);
    expect(safeReturnTo("/app", POOL)).toBe("/app");
    expect(safeReturnTo(`${POOL}?x=1#plan`, "/app")).toBe(`${POOL}?x=1#plan`);
  });

  it("refuses anything else", () => {
    for (const bad of [
      "https://evil.example/app",
      "//evil.example/app",
      "/application",
      "/app/../login",
      "/app\\evil",
      "/login",
      "",
      null,
      42,
      `/app/${"x".repeat(400)}`,
    ]) {
      expect(safeReturnTo(bad, POOL)).toBe(POOL);
    }
  });

  it("drops an earlier Saved marker", () => {
    expect(safeReturnTo(`${POOL}?saved=1&tab=a`, "/app")).toBe(`${POOL}?tab=a`);
  });
});

describe("saved markers", () => {
  it("adds and reads the marker, keeping the anchor last", () => {
    expect(withSaved(`${POOL}#plan`, `reading.${ID}`)).toBe(`${POOL}?saved=reading.${ID}#plan`);
    expect(withSaved(`${POOL}?saved=1`, "1")).toBe(`${POOL}?saved=1`);
    expect(withoutSaved(`${POOL}?saved=1#plan`)).toBe(`${POOL}#plan`);
    expect(parseSaved(`dose.${ID}`)).toEqual({ kind: "dose", id: ID });
    expect(parseSaved(`pump.${ID}`)).toEqual({ kind: "pump", id: ID });
    expect(parseSaved("1")).toBe("saved");
    expect(parseSaved("pools.x")).toBe("saved");
    expect(parseSaved(null)).toBeNull();
  });

  it("builds the from parameter", () => {
    expect(fromParam(`${POOL}/maintenance?saved=1`)).toBe(`from=${encodeURIComponent(`${POOL}/maintenance`)}`);
  });
});
