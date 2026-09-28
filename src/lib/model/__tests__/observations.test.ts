import { describe, expect, it } from "vitest";
import { cyaShield, gallonsToLiters } from "@/engine";
import {
  buildTestPairs,
  cellPpmPerDay,
  dayShares,
  observationsFrom,
  type ModelPool,
  type ModelWeatherDay,
} from "../observations";

const TEN_K_GAL = gallonsToLiters(10_000);
const pool: ModelPool = { volumeL: TEN_K_GAL, sanitizer: "chlorine", covered: false, swgCellLbPerDay: null, timezone: "UTC" };

function sunnyDays(from: string, count: number, overrides: Partial<ModelWeatherDay> = {}): ModelWeatherDay[] {
  const out: ModelWeatherDay[] = [];
  for (let i = 0; i < count; i += 1) {
    const date = new Date(Date.parse(`${from}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10);
    out.push({ date, uv_index_max: 9, sunshine_s: 12 * 3600, shortwave_mj_m2: null, tmax_c: 33, precipitation_mm: 0, ...overrides });
  }
  return out;
}

describe("dayShares", () => {
  it("splits an interval into the share of each local day", () => {
    expect(dayShares("2026-09-01T18:00:00Z", "2026-09-03T06:00:00Z", "UTC")).toEqual([
      { date: "2026-09-01", share: 0.25 },
      { date: "2026-09-02", share: 1 },
      { date: "2026-09-03", share: 0.25 },
    ]);
  });

  it("uses the pool's own calendar", () => {
    // 02:00 UTC is still the evening before in Florida (UTC−4 in September).
    const shares = dayShares("2026-09-02T02:00:00Z", "2026-09-02T14:00:00Z", "America/New_York");
    expect(shares.map((s) => s.date)).toEqual(["2026-09-01", "2026-09-02"]);
    expect(shares[0].share).toBeCloseTo(2 / 24, 10);
    expect(shares[1].share).toBeCloseTo(10 / 24, 10);
  });

  it("handles two tests on the same day", () => {
    expect(dayShares("2026-09-01T06:00:00Z", "2026-09-01T18:00:00Z", "UTC")).toEqual([{ date: "2026-09-01", share: 0.5 }]);
  });
});

describe("cellPpmPerDay", () => {
  it("is zero for chlorine pools and unknown for salt pools without the cell's output", () => {
    expect(cellPpmPerDay(pool)).toBe(0);
    expect(cellPpmPerDay({ ...pool, sanitizer: "swg" })).toBeNull();
  });

  it("turns pounds a day into ppm a day: 0.25 lb in 10,000 gal is about 3 ppm", () => {
    expect(cellPpmPerDay({ ...pool, sanitizer: "swg", swgCellLbPerDay: 0.25 })).toBeCloseTo(2.996, 2);
  });
});

describe("buildTestPairs", () => {
  const weather = sunnyDays("2026-09-01", 12);

  it("measures the loss per day, counting logged chlorine (worked numbers)", () => {
    const pairs = buildTestPairs({
      pool,
      readings: [
        { taken_at: "2026-09-01T08:00:00Z", fc: 6, cya: 40 },
        { taken_at: "2026-09-03T08:00:00Z", fc: 5, cya: null },
      ],
      // One gallon of 12.5% liquid chlorine adds 12.5 ppm to 10,000 gal.
      doses: [{ added_at: "2026-09-02T08:00:00Z", product_id: "liquid-chlorine-12.5", amount: gallonsToLiters(1) * 1000 }],
      events: [],
      weather,
    });
    expect(pairs).toHaveLength(1);
    const [pair] = pairs;
    expect(pair.skip).toBeNull();
    expect(pair.days).toBe(2);
    expect(pair.addedPpm).toBeCloseTo(12.5, 1);
    // (6 + 12.5 − 5) / 2 days
    expect(pair.lossPerDay).toBeCloseTo(6.75, 1);
    expect(pair.drivers?.base).toBeCloseTo(1, 10);
    expect(pair.drivers?.sun).toBeCloseTo(9 * cyaShield(40), 10);
    expect(pair.drivers?.heat).toBeCloseTo(8, 10);
    expect(pair.drivers?.rain).toBe(0);
    expect(pair.drivers?.use).toBe(0);
  });

  it("averages the weather over the interval and counts heavy use per day", () => {
    const rainy = weather.map((d) => (d.date === "2026-09-02" ? { ...d, precipitation_mm: 20, tmax_c: 25, uv_index_max: 3 } : d));
    const [pair] = buildTestPairs({
      pool,
      readings: [
        { taken_at: "2026-09-01T00:00:00Z", fc: 7, cya: 0 },
        { taken_at: "2026-09-03T00:00:00Z", fc: 3, cya: null },
      ],
      doses: [],
      events: [{ occurred_at: "2026-09-02T15:00:00Z", kind: "heavy_use" }],
      weather: rainy,
    });
    // Two whole days: one sunny 33 °C, one rainy 25 °C.
    expect(pair.drivers?.sun).toBeCloseTo((9 + 3) / 2, 10);
    expect(pair.drivers?.heat).toBeCloseTo(4, 10);
    expect(pair.drivers?.rain).toBeCloseTo(1, 10);
    expect(pair.drivers?.use).toBeCloseTo(0.5, 10);
    expect(pair.lossPerDay).toBeCloseTo(2, 10);
  });

  it("dims the sun under a cover from the cover events", () => {
    const [pair] = buildTestPairs({
      pool,
      readings: [
        { taken_at: "2026-09-02T00:00:00Z", fc: 6, cya: 0 },
        { taken_at: "2026-09-03T00:00:00Z", fc: 5, cya: null },
      ],
      doses: [],
      events: [{ occurred_at: "2026-09-01T20:00:00Z", kind: "cover_on" }],
      weather,
    });
    expect(pair.drivers?.sun).toBeCloseTo(0.9, 10);
  });

  it("keeps the pairs it cannot learn from, with the reason", () => {
    const readings = [
      { taken_at: "2026-09-01T08:00:00Z", fc: 6, cya: 40 },
      { taken_at: "2026-09-01T10:00:00Z", fc: 6, cya: null }, // 2 hours later
      { taken_at: "2026-09-03T10:00:00Z", fc: 0.2, cya: null }, // ran out
      { taken_at: "2026-09-04T10:00:00Z", fc: 5, cya: null }, // after a refill
      { taken_at: "2026-09-05T10:00:00Z", fc: null, cya: 40 }, // no FC: not a pair end
      { taken_at: "2026-09-20T10:00:00Z", fc: 4, cya: null }, // 16 days later
    ];
    const pairs = buildTestPairs({
      pool,
      readings,
      doses: [],
      events: [{ occurred_at: "2026-09-04T09:00:00Z", kind: "drain_refill" }],
      weather,
    });
    expect(pairs.map((p) => p.skip)).toEqual(["short", "bottomed", "refill", "long"]);
    expect(observationsFrom(pairs)).toHaveLength(0);
  });

  it("skips intervals without weather, and salt pools without the cell's output", () => {
    const readings = [
      { taken_at: "2026-10-01T08:00:00Z", fc: 6, cya: 40 },
      { taken_at: "2026-10-03T08:00:00Z", fc: 5, cya: null },
    ];
    expect(buildTestPairs({ pool, readings, doses: [], events: [], weather })[0].skip).toBe("weather");
    const salt = { ...pool, sanitizer: "swg" as const };
    expect(buildTestPairs({ pool: salt, readings, doses: [], events: [], weather: sunnyDays("2026-10-01", 3) })[0].skip).toBe(
      "swg-unknown",
    );
  });

  it("adds the salt cell's output when it is known", () => {
    const salt = { ...pool, sanitizer: "swg" as const, swgCellLbPerDay: 0.25 };
    const [pair] = buildTestPairs({
      pool: salt,
      readings: [
        { taken_at: "2026-09-01T08:00:00Z", fc: 4, cya: 70 },
        { taken_at: "2026-09-03T08:00:00Z", fc: 4, cya: null },
      ],
      doses: [],
      events: [],
      weather,
    });
    // FC held at 4 while the cell made about 3 ppm a day: the pool used about 3 a day.
    expect(pair.skip).toBeNull();
    expect(pair.lossPerDay).toBeCloseTo(2.996, 2);
  });

  it("orders tests by time whatever order they arrive in", () => {
    const pairs = buildTestPairs({
      pool,
      readings: [
        { taken_at: "2026-09-05T08:00:00Z", fc: 3, cya: null },
        { taken_at: "2026-09-01T08:00:00Z", fc: 7, cya: 40 },
        { taken_at: "2026-09-03T08:00:00Z", fc: 5, cya: null },
      ],
      doses: [],
      events: [],
      weather,
    });
    expect(pairs.map((p) => p.lossPerDay)).toEqual([1, 1]);
  });
});
