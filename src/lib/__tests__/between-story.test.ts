import { describe, expect, it } from "vitest";
import { betweenLastTests, betweenStats, betweenStory } from "@/lib/between-story";
import { summarizeBetween } from "@/lib/weather/summary";
import { uvLevel, uvText } from "@/lib/uv";

const day = (date: string, uv: number, rain: number, tmax = 31, sun = 36_000) => ({
  date,
  tmax_c: tmax,
  tmin_c: 24,
  uv_index_max: uv,
  sunshine_s: sun,
  precipitation_mm: rain,
});

describe("uv levels", () => {
  it("uses the WHO categories on the rounded index", () => {
    expect([0, 2.4, 2.5, 5.4, 5.5, 7.4, 7.5, 10.4, 10.5, 13].map(uvLevel)).toEqual([
      "low",
      "low",
      "moderate",
      "moderate",
      "high",
      "high",
      "very-high",
      "very-high",
      "extreme",
      "extreme",
    ]);
    expect(uvText(7.2)).toBe("7 · High");
  });
});

describe("betweenStory", () => {
  // 8 days, strong sun, two wet days: 8 + 4 mm.
  const weather = [8, 7.8, 7.5, 7.9, 8, 7.4, 7.6, 7.4].map((uv, i) => day(`2026-09-${18 + i}`, uv, i === 2 ? 8 : i === 5 ? 4 : 0));
  const summary = summarizeBetween(
    { taken_at: "2026-09-18T16:00:00Z", fc: 3 },
    { taken_at: "2026-09-26T16:00:00Z", fc: 8 },
    weather,
  );

  it("tells the weather and what a salt cell did", () => {
    expect(summary.wetDays).toBe(2);
    expect(betweenStory(summary, { from: 3, to: 8 }, true)).toBe(
      "Eight days of strong sun and two wet days. Free chlorine still went from 3.0 to 8.0, so the cell made more than the sun burned.",
    );
  });

  it("gives a manual pool's daily use, counting what was added", () => {
    const s = summarizeBetween({ taken_at: "2026-09-18T16:00:00Z", fc: 6 }, { taken_at: "2026-09-22T16:00:00Z", fc: 4 }, weather.slice(0, 4), {
      fcAddedPpm: 2,
    });
    expect(betweenStory(s, { from: 6, to: 4 }, false)).toBe(
      "Four days of strong sun and one wet day. Free chlorine went from 6.0 to 4.0: about 1.0 ppm a day, counting the 2.0 ppm you added.",
    );
    expect(betweenStory({ ...s, wetDays: 0 }, { from: null, to: 4 }, false)).toBe("Four days of strong sun, all dry.");
  });

  it("gives four stats with qualifiers", () => {
    expect(betweenStats(summary, "us")).toEqual([
      { label: "Peak UV", value: "7.7", qualifier: "average · Very high" },
      { label: "Sunshine", value: "10 h", qualifier: "a day" },
      { label: "Daytime high", value: "88 °F", qualifier: "average" },
      { label: "Rain", value: "0.47 in", qualifier: "over 2 days" },
    ]);
  });
});

describe("betweenLastTests", () => {
  const TZ = "America/New_York";
  const weather = Array.from({ length: 12 }, (_, i) => ({
    date: `2026-09-${String(20 + i).padStart(2, "0")}`,
    tmax_c: 30 + (i % 3),
    tmin_c: 24,
    uv_index_max: i < 6 ? 9 : 5,
    sunshine_s: i < 6 ? 39_600 : 21_600,
    precipitation_mm: i === 7 ? 12.7 : i === 9 ? 2.54 : 0,
  }));

  it("uses each pool's own last two free chlorine tests and the weather between them", () => {
    // Pool A: tests Sep 22 (3.0) and Sep 26 (5.5); a later pH-only test is skipped.
    const a = betweenLastTests({
      readings: [
        { taken_at: "2026-09-22T16:00:00Z", fc: 3 },
        { taken_at: "2026-09-26T16:00:00Z", fc: 5.5 },
        { taken_at: "2026-09-27T16:00:00Z", fc: null },
      ],
      weather,
      timeZone: TZ,
      units: "us",
      swg: true,
    })!;
    expect(a.story).toBe(
      "Four days of strong sun, all dry. Free chlorine still went from 3.0 to 5.5, so the cell made more than the sun burned.",
    );
    expect(a.stats.map((s) => [s.label, s.value, s.qualifier])).toEqual([
      ["Peak UV", "8.2", "average · Very high"],
      ["Sunshine", "10 h", "a day"],
      ["Daytime high", "88 °F", "average"],
      ["Rain", "0.00 in", "no wet days"],
    ]);

    // Pool B: tests Sep 26 (5.5) and Sep 30 (8.0), over the wet, cloudier days.
    const b = betweenLastTests({
      readings: [
        { taken_at: "2026-09-30T16:00:00Z", fc: 8 },
        { taken_at: "2026-09-26T16:00:00Z", fc: 5.5 },
      ],
      weather,
      timeZone: TZ,
      units: "us",
      swg: false,
      fcAddedPpm: () => 4,
    })!;
    expect(b.summary.days).toBe(4);
    expect(b.story).toBe("Four days of moderate sun and two wet days. Free chlorine went from 5.5 to 8.0 with the 4.0 ppm you added.");
    expect(b.stats.map((s) => s.value)).toEqual(["5.0", "6 h", "87 °F", "0.60 in"]);
    expect(b.stats[3].qualifier).toBe("over 2 days");
  });

  it("needs two tests", () => {
    expect(betweenLastTests({ readings: [{ taken_at: "2026-09-30T16:00:00Z", fc: 8 }], weather, timeZone: TZ, units: "us", swg: false })).toBeNull();
  });
});
