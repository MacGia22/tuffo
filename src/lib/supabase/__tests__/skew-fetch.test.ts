import { describe, expect, it } from "vitest";
import { createSkewRetryFetch } from "../skew-fetch";

const FUTURE_BODY = JSON.stringify({ code: "PGRST303", message: "JWT issued at future" });

function scripted(responses: Array<() => Response>) {
  let calls = 0;
  const base = (async () => responses[Math.min(calls++, responses.length - 1)]()) as typeof fetch;
  return { base, calls: () => calls };
}

const future = () => new Response(FUTURE_BODY, { status: 401 });
const ok = () => new Response("[]", { status: 200 });
const denied = () => new Response(JSON.stringify({ message: "permission denied" }), { status: 401 });

const quiet = { waits: [0, 0, 0, 0], log: () => {}, sleep: async () => {} };

describe("createSkewRetryFetch", () => {
  it("passes a normal answer straight through", async () => {
    const s = scripted([ok]);
    const res = await createSkewRetryFetch(s.base, quiet)("https://db/rest/v1/pools");
    expect(res.status).toBe(200);
    expect(s.calls()).toBe(1);
  });

  it("retries while the database says the token is from the future", async () => {
    const s = scripted([future, future, ok]);
    const logs: string[] = [];
    const res = await createSkewRetryFetch(s.base, { ...quiet, log: (m) => logs.push(m) })("https://db/rest/v1/pools", {
      headers: { Authorization: "Bearer a.b.c" },
    });
    expect(res.status).toBe(200);
    expect(s.calls()).toBe(3);
    expect(logs).toHaveLength(2);
    expect(logs[0]).toContain("issued in the future");
  });

  it("gives up after the last wait and returns the refusal", async () => {
    const s = scripted([future]);
    const res = await createSkewRetryFetch(s.base, quiet)("https://db/rest/v1/pools");
    expect(res.status).toBe(401);
    expect(s.calls()).toBe(5);
  });

  it("does not retry other refusals", async () => {
    const s = scripted([denied]);
    const res = await createSkewRetryFetch(s.base, quiet)("https://db/rest/v1/pools");
    expect(res.status).toBe(401);
    expect(s.calls()).toBe(1);
  });

  it("reports how far ahead the token's stamp is", async () => {
    const payload = Buffer.from(JSON.stringify({ iat: Math.floor(Date.now() / 1000) + 5 })).toString("base64url");
    const s = scripted([future, ok]);
    const logs: string[] = [];
    await createSkewRetryFetch(s.base, { ...quiet, log: (m) => logs.push(m) })("https://db/rest/v1/pools", {
      headers: new Headers({ Authorization: `Bearer h.${payload}.s` }),
    });
    expect(logs[0]).toMatch(/stamp (4|5)\.\d s ahead/);
  });
});
