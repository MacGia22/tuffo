import { describe, expect, it } from "vitest";
import { historyCells, levelOf, rangeText, testAge, tilesFor } from "../tiles";

const targets = {
  fc: { low: 3, high: 4.5 },
  ph: { low: 7.2, high: 7.8 },
  ta: { low: 60, high: 80 },
  ch: { low: 250, high: 450 },
  cya: { low: 60, high: 80 },
  salt: { low: 2800, high: 3600 },
};

describe("tiles", () => {
  it("rates a value against its range, ends inside", () => {
    expect(levelOf(2.9, targets.fc)).toBe("low");
    expect(levelOf(3, targets.fc)).toBe("ok");
    expect(levelOf(4.5, targets.fc)).toBe("ok");
    expect(levelOf(4.6, targets.fc)).toBe("high");
    expect(rangeText({ low: 3, high: 4.5 })).toBe("3–4.5");
    expect(rangeText({ low: 7.2, high: 7.8 })).toBe("7.2–7.8");
  });

  it("builds the tiles, with salt for salt pools and CC only when logged", () => {
    const reading = { fc: 5, cc: null, ph: 7.5, ta: 50, ch: 300, cya: 40, salt: 3200 };
    const swg = tilesFor(reading, targets, { swg: true });
    expect(swg.map((t) => t.key)).toEqual(["fc", "ph", "ta", "ch", "cya", "salt"]);
    expect(swg.map((t) => t.level)).toEqual(["high", "ok", "low", "ok", "low", "ok"]);
    expect(swg[0].range).toBe("3–4.5 ppm");
    expect(swg[1].range).toBe("7.2–7.8");
    const plain = tilesFor({ ...reading, cc: 0.8, ta: null }, { ...targets, salt: undefined }, { swg: false });
    expect(plain.map((t) => t.key)).toEqual(["fc", "ph", "ta", "ch", "cya", "cc"]);
    expect(plain.find((t) => t.key === "ta")).toMatchObject({ value: null, level: null });
    expect(plain.find((t) => t.key === "cc")).toMatchObject({ level: "high", range: "0–0.5 ppm" });
  });

  it("says how old the test is and flags a week", () => {
    const now = Date.parse("2026-10-01T12:00:00Z");
    expect(testAge("2026-10-01T11:30:00Z", now).text).toBe("just now");
    expect(testAge("2026-10-01T07:00:00Z", now).text).toBe("5 hours ago");
    expect(testAge("2026-09-30T08:00:00Z", now).text).toBe("yesterday");
    expect(testAge("2026-09-28T12:00:00Z", now)).toMatchObject({ text: "3 days ago", stale: false });
    expect(testAge("2026-09-23T12:00:00Z", now)).toMatchObject({ text: "8 days ago", stale: true });
  });
});

describe("historyCells", () => {
  it("formats each measure and rates it against the pool's targets", () => {
    const cells = historyCells({ fc: 2.5, cc: 0.8, ph: 7.45, ta: 70, ch: 300, cya: null, salt: 3200 }, targets);
    expect(cells.map((c) => [c.label, c.text, c.level])).toEqual([
      ["FC", "2.5", "low"],
      ["CC", "0.8", "high"],
      ["pH", "7.45", "ok"],
      ["TA", "70", "ok"],
      ["CH", "300", "ok"],
      ["CYA", "—", null],
      ["Salt", "3200", "ok"],
    ]);
  });

  it("leaves salt unrated without a salt target", () => {
    const cells = historyCells({ fc: 4, cc: null, ph: 7.5, ta: 70, ch: 300, cya: 70, salt: 900 }, { ...targets, salt: undefined });
    expect(cells.find((c) => c.key === "salt")).toEqual({ key: "salt", label: "Salt", text: "900", level: null });
    expect(cells.find((c) => c.key === "ph")?.text).toBe("7.5");
  });
});
