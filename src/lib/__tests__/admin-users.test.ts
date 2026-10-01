import { describe, expect, it } from "vitest";
import { sourceCounts, userRows, userSource } from "@/lib/admin-users";

describe("admin users", () => {
  it("names the source: link label, else invited, else direct", () => {
    expect(userSource({ id: "a", created_at: "", user_metadata: { signup_source: "trouble-free-pool" } })).toBe("trouble-free-pool");
    expect(userSource({ id: "b", created_at: "", invited_at: "2026-09-29T10:00:00Z", user_metadata: {} })).toBe("invited");
    expect(userSource({ id: "c", created_at: "", user_metadata: null })).toBe("direct");
  });

  it("lists newest sign-ups first, with no sign-in yet as null", () => {
    const rows = userRows([
      { id: "1", email: "old@example.com", created_at: "2026-09-20T10:00:00Z", last_sign_in_at: "2026-09-30T08:00:00Z" },
      { id: "2", email: "new@example.com", created_at: "2026-09-30T10:00:00Z", invited_at: "2026-09-30T10:00:00Z" },
    ]);
    expect(rows.map((r) => [r.email, r.lastSignInAt, r.source])).toEqual([
      ["new@example.com", null, "invited"],
      ["old@example.com", "2026-09-30T08:00:00Z", "direct"],
    ]);
  });

  it("counts accounts per source, most first", () => {
    expect(sourceCounts([{ source: "reddit" }, { source: "invited" }, { source: "reddit" }])).toEqual([
      { source: "reddit", count: 2 },
      { source: "invited", count: 1 },
    ]);
  });
});
