import { describe, expect, it } from "vitest";
import { isClockSkewError, retryAllOnClockSkew, retryOnClockSkew } from "../retry";

const skew = { error: { message: "JWT issued at future" } };
const ok = { error: null, data: 1 };

/** A query that fails with the clock-skew error `failures` times, then succeeds. */
function flaky(failures: number) {
  let calls = 0;
  const run = async () => (calls++ < failures ? skew : ok);
  return { run, calls: () => calls };
}

describe("retryOnClockSkew", () => {
  it("recognises the error", () => {
    expect(isClockSkewError(skew.error)).toBe(true);
    expect(isClockSkewError({ message: "permission denied" })).toBe(false);
    expect(isClockSkewError(null)).toBe(false);
  });

  it("does not wait or retry when the first answer is fine", async () => {
    const q = flaky(0);
    expect(await retryOnClockSkew(q.run, [0, 0, 0])).toBe(ok);
    expect(q.calls()).toBe(1);
  });

  it("keeps retrying while the skew lasts, up to three times", async () => {
    const q = flaky(3);
    expect(await retryOnClockSkew(q.run, [0, 0, 0])).toBe(ok);
    expect(q.calls()).toBe(4);
  });

  it("gives up and returns the error after the last wait", async () => {
    const q = flaky(9);
    expect(await retryOnClockSkew(q.run, [0, 0, 0])).toBe(skew);
    expect(q.calls()).toBe(4);
  });

  it("does not retry other errors", async () => {
    let calls = 0;
    const denied = { error: { message: "permission denied" } };
    expect(await retryOnClockSkew(async () => (calls++, denied), [0, 0, 0])).toBe(denied);
    expect(calls).toBe(1);
  });
});

describe("retryAllOnClockSkew", () => {
  it("retries the whole group when any query hits the skew", async () => {
    const a = flaky(2);
    let bCalls = 0;
    const [ra, rb] = await retryAllOnClockSkew(async () => Promise.all([a.run(), (bCalls++, ok)]), [0, 0, 0]);
    expect(ra).toBe(ok);
    expect(rb).toBe(ok);
    expect(bCalls).toBe(3);
  });
});
