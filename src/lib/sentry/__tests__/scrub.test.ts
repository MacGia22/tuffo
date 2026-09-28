import { describe, expect, it } from "vitest";
import { redactEmails, scrubBreadcrumb, scrubEvent, stripQuery } from "../scrub";

describe("redactEmails", () => {
  it("replaces every address", () => {
    expect(redactEmails("from ann@example.com to Bob.Smith+pool@mail.co.uk")).toBe("from [email] to [email]");
  });

  it("leaves other text alone", () => {
    expect(redactEmails("FC 3.2 ppm at 10:00")).toBe("FC 3.2 ppm at 10:00");
  });
});

describe("stripQuery", () => {
  it("drops the query string and fragment", () => {
    expect(stripQuery("https://tuffo.app/auth/callback?token_hash=abc&type=email")).toBe(
      "https://tuffo.app/auth/callback",
    );
    expect(stripQuery("/app/pools/1#chart")).toBe("/app/pools/1");
  });

  it("keeps a URL without one", () => {
    expect(stripQuery("https://tuffo.app/app")).toBe("https://tuffo.app/app");
  });
});

describe("scrubEvent", () => {
  const event = {
    message: "failed for ann@example.com",
    user: { id: "u1", email: "ann@example.com", ip_address: "203.0.113.9" },
    server_name: "host-1",
    extra: { email: "ann@example.com" },
    request: {
      url: "https://tuffo.app/auth/callback?token_hash=secret",
      query_string: "token_hash=secret",
      data: { email: "ann@example.com" },
      cookies: { "sb-access-token": "jwt" },
      headers: { Cookie: "sb=jwt", Authorization: "Bearer x", "User-Agent": "Safari", "X-Forwarded-For": "203.0.113.9" },
      env: { REMOTE_ADDR: "203.0.113.9" },
    },
    exception: { values: [{ type: "Error", value: "no pool for ann@example.com" }, { type: "TypeError" }] },
    breadcrumbs: [
      { category: "fetch", data: { url: "https://x.supabase.co/rest/v1/profiles?email=eq.ann@example.com", method: "GET", status_code: 200 } },
      { category: "console", message: "signed in as ann@example.com" },
    ],
  };

  const scrubbed = scrubEvent(event);

  it("removes the user, host name and extras", () => {
    expect(scrubbed.user).toBeUndefined();
    expect(scrubbed.server_name).toBeUndefined();
    expect(scrubbed.extra).toBeUndefined();
  });

  it("keeps only the path of the request and two harmless headers", () => {
    expect(scrubbed.request).toEqual({
      url: "https://tuffo.app/auth/callback",
      headers: { "User-Agent": "Safari" },
    });
  });

  it("redacts addresses in messages, exceptions and breadcrumbs", () => {
    expect(scrubbed.message).toBe("failed for [email]");
    expect(scrubbed.exception?.values).toEqual([
      { type: "Error", value: "no pool for [email]" },
      { type: "TypeError" },
    ]);
    expect(scrubbed.breadcrumbs?.[0].data).toEqual({
      url: "https://x.supabase.co/rest/v1/profiles",
      method: "GET",
      status_code: 200,
    });
    expect(scrubbed.breadcrumbs?.[1].message).toBe("signed in as [email]");
  });

  it("leaves no address anywhere in the event", () => {
    expect(JSON.stringify(scrubbed)).not.toMatch(/ann@example\.com|203\.0\.113\.9|secret|jwt/);
  });

  it("does not change the original", () => {
    expect(event.user.email).toBe("ann@example.com");
    expect(event.request.data).toBeDefined();
  });
});

describe("scrubBreadcrumb", () => {
  it("drops bodies and the query of navigation targets", () => {
    expect(
      scrubBreadcrumb({ data: { from: "/login?next=/app", to: "/app?x=1", body: "{\"email\":\"a@b.co\"}" } }).data,
    ).toEqual({ from: "/login", to: "/app" });
  });
});
