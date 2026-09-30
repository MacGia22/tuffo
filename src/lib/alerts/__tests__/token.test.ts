import { describe, expect, it } from "vitest";
import { readUnsubscribeToken, unsubscribeToken } from "../token";

const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const POOL = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("unsubscribe tokens", () => {
  it("round-trips for a pool and for everything", () => {
    expect(readUnsubscribeToken(unsubscribeToken(USER, POOL, "s3cret"), "s3cret")).toEqual({ userId: USER, poolId: POOL });
    expect(readUnsubscribeToken(unsubscribeToken(USER, null, "s3cret"), "s3cret")).toEqual({ userId: USER, poolId: null });
  });

  it("refuses a forged or altered link", () => {
    const token = unsubscribeToken(USER, POOL, "s3cret");
    expect(readUnsubscribeToken(token, "other")).toBeNull();
    expect(readUnsubscribeToken(token.replace(POOL, "cccccccc-cccc-4ccc-8ccc-cccccccccccc"), "s3cret")).toBeNull();
    expect(readUnsubscribeToken("nonsense", "s3cret")).toBeNull();
    expect(readUnsubscribeToken(`${USER}.all.`, "s3cret")).toBeNull();
  });
});
