import { describe, expect, it } from "vitest";
import { retestsDue, testStatus, todayActions, weekCards, type ActionsInput } from "@/lib/today";

const TZ = "America/New_York";

describe("testStatus", () => {
  it("says when the last test was, and turns to Time to test after a week", () => {
    const now = Date.parse("2026-10-01T16:00:00Z");
    expect(testStatus("2026-09-26T16:00:00Z", "Drop kit", now, TZ)).toEqual({
      title: "Tested 5 days ago",
      detail: "Sat, Sep 26 · 12:00 PM · drop kit",
      due: false,
    });
    expect(testStatus("2026-09-23T16:00:00Z", "Strips", now, TZ)).toMatchObject({
      title: "Time to test",
      detail: "Last test 8 days ago · Wed, Sep 23 · 12:00 PM · strips",
      due: true,
    });
    expect(testStatus("2026-10-01T13:00:00Z", "Drop kit", now, TZ).title).toBe("Tested 3 hours ago");
    // Calendar days in the pool's zone: Thu 8:00 AM read on Sat 7:00 AM is 2 days ago, not "yesterday".
    expect(testStatus("2026-10-01T12:00:00Z", "Drop kit", Date.parse("2026-10-03T11:00:00Z"), TZ).title).toBe("Tested 2 days ago");
    // 11 PM yesterday, read at 1 AM: yesterday.
    expect(testStatus("2026-10-02T03:00:00Z", "Drop kit", Date.parse("2026-10-02T05:00:00Z"), TZ).title).toBe("Tested yesterday");
  });
});

describe("todayActions", () => {
  const base: ActionsInput = { today: "2026-10-01", advice: [], plan: null, band: null, retests: [], maintenance: [] };

  it("puts free chlorine below its minimum first, with the dose as the instruction", () => {
    const actions = todayActions({
      ...base,
      advice: [
        { measure: "ph", severity: "act", title: "pH 7.90 is high", detail: "Lower it to 7.5 with muriatic acid.", dose: { text: "10 fl oz of muriatic acid", amount: "10 fl oz", href: "/ph", notes: [] } },
        {
          measure: "fc",
          severity: "act",
          title: "Free chlorine 1.5 ppm is below the minimum of 2 ppm",
          detail: "Bring it to about 4.0 ppm now; below the minimum, algae gets a head start.",
          dose: { text: "1 qt of liquid chlorine 12.5%", amount: "1 qt", href: "/dose", notes: ["Pour in front of a return."] },
        },
        { measure: "fc", severity: "ok", title: "ignored", detail: "ignored" },
      ],
      plan: { kind: "add", text: "1 qt of liquid chlorine 12.5%", amount: "1 qt", href: "/plan", floor: 3, target: "3–5 ppm" },
    });
    expect(actions.map((a) => a.id)).toEqual(["advice-fc", "advice-ph"]);
    expect(actions[0]).toEqual({
      id: "advice-fc",
      title: "Add 1 qt of liquid chlorine 12.5%",
      why: "Free chlorine 1.5 ppm is below the minimum of 2 ppm. Bring it to about 4.0 ppm now; below the minimum, algae gets a head start.",
      pill: "Today",
      button: { label: "I added 1 qt", href: "/dose" },
      notes: ["Pour in front of a return."],
    });
  });

  it("asks to set the salt cell when the plan differs from what is logged, then the band and the rest", () => {
    const actions = todayActions({
      ...base,
      plan: { kind: "cell", percent: 25, logged: 50, href: "/cell?value=25", needPpm: 2.1, cellHours: 8 },
      band: { direction: "high", text: "At 50% free chlorine climbs above 5 ppm by Friday: lower the cell to 25% from Friday, then test." },
      retests: [{ key: "cya", label: "Stabilizer", lastTestedOn: "2026-09-06", dueOn: "2026-10-06" }],
      maintenance: [{ id: "clean-filter", label: "Clean the filter", daysLeft: 3, nextDue: "2026-10-04", relative: "in 3 days" }],
    });
    expect(actions.map((a) => [a.title, a.pill])).toEqual([
      ["Set the salt cell to 25%", "Today"],
      ["Lower the cell to 25% from Friday, then test", "This week"],
      ["Test stabilizer", "Around Oct 6"],
      ["Clean the filter", "Around Oct 4"],
    ]);
    expect(actions[0]).toMatchObject({
      why: "It is logged at 50%. It needs to make about 2.1 ppm of free chlorine a day with the cell running 8 h a day for this week's weather.",
      button: { label: "I set it to 25%", href: "/cell?value=25" },
    });
    expect(actions[1].why).toBe("At 50% free chlorine climbs above 5 ppm by Friday.");
    expect(actions[3].task).toEqual({ id: "clean-filter", label: "Clean the filter" });
  });

  it("puts a task due for high filter pressure with today's, whatever its calendar date", () => {
    const actions = todayActions({
      ...base,
      retests: [{ key: "cya", label: "Stabilizer", lastTestedOn: "2026-09-04", dueOn: "2026-10-04" }],
      maintenance: [{ id: "backwash", label: "Backwash the filter", daysLeft: 21, nextDue: "2026-10-22", relative: "now", pressureHigh: true }],
    });
    expect(actions.map((a) => [a.title, a.pill, a.why])).toEqual([
      ["Backwash the filter", "Today", "Due now: the filter pressure is up."],
      ["Test stabilizer", "Around Oct 4", expect.any(String)],
    ]);
  });

  it("says nothing about a cell already at the plan's setting", () => {
    expect(todayActions({ ...base, plan: { kind: "cell", percent: 25, logged: 25, href: "/c", needPpm: 2, cellHours: null } })).toEqual([]);
  });
});

describe("retestsDue", () => {
  it("lists never-tested measures and those due within a week", () => {
    expect(
      retestsDue(
        [
          { key: "cya", label: "Stabilizer", testedOn: "2026-09-04" },
          { key: "ch", label: "Calcium", testedOn: "2026-09-20" },
          { key: "salt", label: "Salt", testedOn: null },
        ],
        "2026-10-01",
      ),
    ).toEqual([
      { key: "cya", label: "Stabilizer", lastTestedOn: "2026-09-04", dueOn: "2026-10-04" },
      { key: "salt", label: "Salt", lastTestedOn: null, dueOn: "2026-10-01" },
    ]);
  });
});

describe("weekCards", () => {
  it("builds a card per day: UV, rain or Dry, FC by evening and the action", () => {
    const cards = weekCards({
      today: "2026-10-01",
      units: "us",
      forecast: [
        { date: "2026-10-01", uv_index_max: 7.2, precipitation_mm: 20.3, precipitation_probability: 52 },
        { date: "2026-10-02", uv_index_max: 8.6, precipitation_mm: 0, precipitation_probability: 10 },
        { date: "2026-09-30", uv_index_max: 8, precipitation_mm: 0, precipitation_probability: 0 },
      ],
      plan: {
        kind: "swg",
        loggedPercent: 25,
        days: [
          { date: "2026-10-01", fcEnd: 7.8, algaeRisk: false, add: null, cellPercent: 25 },
          { date: "2026-10-02", fcEnd: 8.1, algaeRisk: false, add: null, cellPercent: 25 },
          { date: "2026-10-03", fcEnd: 1.4, algaeRisk: true, add: null, cellPercent: 50 },
        ],
      },
      tests: { "2026-10-02": ["CYA"] },
    });
    expect(cards.map((c) => [c.day, c.dateText, c.uv?.index ?? null, c.uv?.level ?? null, c.rain, c.fc, c.actions, c.risk])).toEqual([
      ["Today", "Oct 1", 7, "high", "0.8 in · 52%", "≈ 7.8", ["Keep 25%"], false],
      ["Fri", "Oct 2", 9, "very-high", "Dry", "≈ 8.1", ["Keep 25%", "Test CYA"], false],
      ["Sat", "Oct 3", null, null, null, "≈ 1.4", ["Set 50%"], true],
    ]);
  });

  it("gives a chlorine pool's additions and works without a plan", () => {
    const cards = weekCards({
      today: "2026-10-01",
      units: "metric",
      forecast: [{ date: "2026-10-01", uv_index_max: 2, precipitation_mm: 6, precipitation_probability: null }],
      plan: null,
      tests: {},
    });
    expect(cards).toEqual([
      { date: "2026-10-01", day: "Today", dateText: "Oct 1", today: true, uv: { index: 2, level: "low" }, rain: "6 mm", fc: null, actions: [], risk: false },
    ]);
    const manual = weekCards({
      today: "2026-10-01",
      units: "us",
      forecast: [],
      plan: { kind: "manual", loggedPercent: null, days: [{ date: "2026-10-01", fcEnd: 4, algaeRisk: false, add: "1 qt", cellPercent: null }] },
      tests: {},
    });
    expect(manual[0].actions).toEqual(["Add 1 qt"]);
    // A salt plan without the cell's output: no FC line to show.
    const unknownCell = weekCards({
      today: "2026-10-01",
      units: "us",
      forecast: [],
      plan: { kind: "swg", loggedPercent: null, days: [{ date: "2026-10-01", fcEnd: null, algaeRisk: false, add: null, cellPercent: null }] },
      tests: {},
    });
    expect(unknownCell[0].fc).toBeNull();
  });

  it("never shows rain as 0.0 in or 0 mm, and calls it dry by the chart's rule", () => {
    const card = (mm: number, chance: number | null, units: "us" | "metric") =>
      weekCards({ today: "2026-10-01", units, forecast: [{ date: "2026-10-01", uv_index_max: null, precipitation_mm: mm, precipitation_probability: chance }], plan: null, tests: {} })[0].rain;
    expect(card(1, 10, "us")).toBe("0.04 in · 10%");
    expect(card(0.4, 10, "metric")).toBe("0.4 mm · 10%");
    expect(card(0.2, 10, "metric")).toBe("Dry");
    expect(card(0.2, 40, "us")).toBe("0.01 in · 40%");
    // A chance with no amount (common in the forecast) gives the chance alone.
    expect(card(0, 40, "us")).toBe("40% chance");
    expect(card(0.1, 40, "us")).toBe("< 0.01 in · 40%");
    expect(card(0, 40, "metric")).toBe("40% chance");
  });
});
