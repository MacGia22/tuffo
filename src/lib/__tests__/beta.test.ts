import { describe, expect, it } from "vitest";
import {
  createRateLimiter,
  isAdminEmail,
  normalizeEmail,
  normalizeSource,
  parseAdminEmails,
  signupSource,
} from "../beta";

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

describe("normalizeSource", () => {
  it("keeps a short link label, lower-cased", () => {
    expect(normalizeSource("Pools")).toBe("pools");
    expect(normalizeSource(" swimming_pools-2 ")).toBe("swimming_pools-2");
  });

  it("falls back to landing for anything else", () => {
    expect(normalizeSource(undefined)).toBe("landing");
    expect(normalizeSource("")).toBe("landing");
    expect(normalizeSource("a b")).toBe("landing");
    expect(normalizeSource("<script>")).toBe("landing");
    expect(normalizeSource("x".repeat(31))).toBe("landing");
  });
});

describe("signupSource", () => {
  it("keeps a real link label and drops the default", () => {
    expect(signupSource("Pools")).toBe("pools");
    expect(signupSource(null)).toBeNull();
    expect(signupSource("landing")).toBeNull();
    expect(signupSource("not valid!")).toBeNull();
  });
});
