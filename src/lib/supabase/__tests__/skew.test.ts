import { describe, expect, it } from "vitest";
import { SETTLE_MAX_MS, SETTLE_MIN_MS, secondsAhead, settleWaitMs, tokenIssuedAt } from "../skew";

/** A token with the given payload; the signature is irrelevant here. */
function token(payload: object): string {
  const b64 = (v: object) => Buffer.from(JSON.stringify(v)).toString("base64url");
  return `${b64({ alg: "HS256" })}.${b64(payload)}.sig`;
}

describe("tokenIssuedAt", () => {
  it("reads iat from the payload", () => {
    expect(tokenIssuedAt(token({ iat: 1790568000, sub: "x" }))).toBe(1790568000);
  });

  it("is null for anything unreadable", () => {
    expect(tokenIssuedAt(undefined)).toBeNull();
    expect(tokenIssuedAt("not-a-jwt")).toBeNull();
    expect(tokenIssuedAt("a.!!!.c")).toBeNull();
    expect(tokenIssuedAt(token({ sub: "x" }))).toBeNull();
  });
});

describe("settleWaitMs", () => {
  const now = 1_790_568_000_000;

  it("waits the minimum when the token is already in the past", () => {
    expect(settleWaitMs(now / 1000 - 5, now)).toBe(SETTLE_MIN_MS);
    expect(settleWaitMs(null, now)).toBe(SETTLE_MIN_MS);
  });

  it("waits until the stamp has passed, plus a margin", () => {
    // Stamped 4 s ahead: 4 s + 1.5 s margin.
    expect(settleWaitMs(now / 1000 + 4, now)).toBe(5500);
  });

  it("never waits longer than the cap", () => {
    expect(settleWaitMs(now / 1000 + 120, now)).toBe(SETTLE_MAX_MS);
  });

  it("measures the gap in seconds", () => {
    expect(secondsAhead(now / 1000 + 7, now)).toBeCloseTo(7, 6);
  });
});
