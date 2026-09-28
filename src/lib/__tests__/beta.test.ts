import { describe, expect, it } from "vitest";
import { createRateLimiter, feedbackMailto, isAdminEmail, normalizeEmail, parseAdminEmails } from "../beta";

describe("normalizeEmail", () => {
  it("trims and lower-cases a valid address", () => {
    expect(normalizeEmail("  Ann.Smith@Example.COM ")).toBe("ann.smith@example.com");
  });

  it("rejects what is not an address", () => {
    expect(normalizeEmail("ann@example")).toBeNull();
    expect(normalizeEmail("ann example.com")).toBeNull();
    expect(normalizeEmail(42)).toBeNull();
    expect(normalizeEmail(`${"a".repeat(250)}@b.co`)).toBeNull();
  });
});

describe("admin allowlist", () => {
  const admins = parseAdminEmails(" gianluca@example.com, Ops@Example.com;bad-entry ");

  it("reads comma, space or semicolon separated addresses and skips junk", () => {
    expect([...admins].sort()).toEqual(["gianluca@example.com", "ops@example.com"]);
  });

  it("matches regardless of case", () => {
    expect(isAdminEmail("GIANLUCA@example.com", admins)).toBe(true);
    expect(isAdminEmail("someone@example.com", admins)).toBe(false);
    expect(isAdminEmail(undefined, admins)).toBe(false);
  });

  it("is empty when the variable is unset, so nobody is an admin", () => {
    expect(parseAdminEmails(undefined).size).toBe(0);
    expect(isAdminEmail("gianluca@example.com", parseAdminEmails(""))).toBe(false);
  });
});

describe("createRateLimiter", () => {
  it("allows the limit within a window, then refuses until it resets", () => {
    const allow = createRateLimiter({ limit: 2, windowMs: 1000 });
    expect(allow("a", 0)).toBe(true);
    expect(allow("a", 10)).toBe(true);
    expect(allow("a", 20)).toBe(false);
    expect(allow("b", 20)).toBe(true);
    expect(allow("a", 1000)).toBe(true);
  });

  it("stays bounded in memory", () => {
    const allow = createRateLimiter({ limit: 1, windowMs: 1000, maxKeys: 3 });
    for (const key of ["a", "b", "c", "d", "e"]) expect(allow(key, 0)).toBe(true);
  });
});

describe("feedbackMailto", () => {
  it("addresses hello@ with a subject and the app version", () => {
    const link = feedbackMailto("4ce369c");
    expect(link.startsWith("mailto:hello@tuffo.app?subject=Tuffo%20feedback&body=")).toBe(true);
    expect(decodeURIComponent(link.split("body=")[1])).toContain("App version: 4ce369c");
  });
});
