import { describe, expect, it } from "vitest";
import { DEFAULT_AFTER_SIGN_IN, safeNextPath } from "../redirects";

describe("safeNextPath", () => {
  it("keeps same-site paths", () => {
    expect(safeNextPath("/app/pools/abc?tab=readings")).toBe("/app/pools/abc?tab=readings");
  });

  it("falls back for empty values", () => {
    expect(safeNextPath(null)).toBe(DEFAULT_AFTER_SIGN_IN);
    expect(safeNextPath("")).toBe(DEFAULT_AFTER_SIGN_IN);
  });

  it("rejects other hosts and protocol-relative tricks", () => {
    expect(safeNextPath("https://evil.example")).toBe(DEFAULT_AFTER_SIGN_IN);
    expect(safeNextPath("//evil.example/app")).toBe(DEFAULT_AFTER_SIGN_IN);
    expect(safeNextPath("/\\evil.example")).toBe(DEFAULT_AFTER_SIGN_IN);
    expect(safeNextPath("app")).toBe(DEFAULT_AFTER_SIGN_IN);
    expect(safeNextPath("/app\nSet-Cookie: x")).toBe(DEFAULT_AFTER_SIGN_IN);
  });
});
