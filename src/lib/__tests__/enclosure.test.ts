import { describe, expect, it } from "vitest";
import { readEnclosure, suggestedSunPct } from "../enclosure";

describe("readEnclosure", () => {
  it("suggests a share for each screen and keeps the owner's own", () => {
    expect(suggestedSunPct("screen")).toBe(70);
    expect(readEnclosure("none", "")).toEqual({ ok: true, enclosure: null, sunPct: null });
    expect(readEnclosure("screen", "")).toEqual({ ok: true, enclosure: "screen", sunPct: 70 });
    expect(readEnclosure("fine_screen", "62%")).toEqual({ ok: true, enclosure: "fine_screen", sunPct: 62 });
  });

  it("refuses an unknown kind or a share outside 5–100%", () => {
    expect(readEnclosure("dome", "")).toMatchObject({ ok: false });
    expect(readEnclosure("screen", "120")).toMatchObject({ ok: false });
    expect(readEnclosure("screen", "2")).toMatchObject({ ok: false });
  });
});
