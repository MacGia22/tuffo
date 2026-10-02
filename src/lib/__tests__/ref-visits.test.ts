import { describe, expect, it } from "vitest";
import { refFunnel, refToCount, type VisitRequest } from "@/lib/ref-visits";

const BROWSER = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1";

function req(over: Partial<VisitRequest> & { headers?: Record<string, string> } = {}): VisitRequest {
  const headers: Record<string, string> = { "user-agent": BROWSER, ...over.headers };
  return {
    method: over.method ?? "GET",
    pathname: over.pathname ?? "/",
    ref: over.ref === undefined ? "pools" : over.ref,
    header: (name) => headers[name] ?? null,
  };
}

describe("refToCount", () => {
  it("counts a page load from a labelled link, lower-cased", () => {
    expect(refToCount(req())).toBe("pools");
    expect(refToCount(req({ ref: " Reddit ", pathname: "/privacy" }))).toBe("reddit");
  });

  it("ignores missing or malformed labels", () => {
    expect(refToCount(req({ ref: null }))).toBeNull();
    expect(refToCount(req({ ref: "" }))).toBeNull();
    expect(refToCount(req({ ref: "<script>" }))).toBeNull();
    expect(refToCount(req({ ref: "x".repeat(31) }))).toBeNull();
  });

  it("skips the app and sign-in pages, which carry the label on", () => {
    expect(refToCount(req({ pathname: "/login" }))).toBeNull();
    expect(refToCount(req({ pathname: "/app/pools" }))).toBeNull();
    expect(refToCount(req({ pathname: "/auth/callback" }))).toBeNull();
    expect(refToCount(req({ pathname: "/apple" }))).toBe("pools");
  });

  it("skips prefetches, in-app navigation and non-GET requests", () => {
    expect(refToCount(req({ headers: { rsc: "1" } }))).toBeNull();
    expect(refToCount(req({ headers: { "next-router-prefetch": "1" } }))).toBeNull();
    expect(refToCount(req({ headers: { "sec-purpose": "prefetch;prerender" } }))).toBeNull();
    expect(refToCount(req({ method: "POST" }))).toBeNull();
  });

  it("skips link previews and crawlers", () => {
    for (const agent of ["Slackbot-LinkExpanding 1.0", "facebookexternalhit/1.1", "Googlebot/2.1", "curl/8.5.0"]) {
      expect(refToCount(req({ headers: { "user-agent": agent } }))).toBeNull();
    }
    expect(refToCount({ ...req(), header: () => null })).toBeNull();
  });
});

describe("refFunnel", () => {
  it("adds up visits, sign-ups and first tests per label, most visits first", () => {
    const rows = refFunnel(
      [
        { label: "pools", visits: 12 },
        { label: "pools", visits: 3 },
        { label: "reddit", visits: 40 },
        { label: "quiet", visits: 0 },
      ],
      [
        { id: "a", source: "pools" },
        { id: "b", source: "pools" },
        { id: "c", source: "forum" },
        { id: "d", source: "invited" },
        { id: "e", source: "direct" },
      ],
      new Set(["a", "c", "d"]),
    );
    expect(rows).toEqual([
      { label: "reddit", visits: 40, signups: 0, firstTests: 0 },
      { label: "pools", visits: 15, signups: 2, firstTests: 1 },
      { label: "forum", visits: 0, signups: 1, firstTests: 1 },
      { label: "quiet", visits: 0, signups: 0, firstTests: 0 },
    ]);
  });

  it("is empty with nothing to show", () => {
    expect(refFunnel([], [{ id: "a", source: "direct" }], new Set())).toEqual([]);
  });
});
