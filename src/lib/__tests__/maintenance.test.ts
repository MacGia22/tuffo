import { describe, expect, it } from "vitest";
import {
  ageYears,
  cellHoursUsed,
  cellReplacementMonth,
  dueCalendar,
  healthItems,
  intervalProgress,
  lifeSpan,
  describeInterval,
  dueTasks,
  dueText,
  formatAge,
  hoursLife,
  intervalFor,
  intervalFromForm,
  lifeState,
  maintenanceStatus,
  pressureStatus,
  splitInterval,
  taskById,
  tasksFor,
  type MaintenancePool,
} from "../maintenance";
import { cellRatedHours } from "../salt-cells";

const saltCartridge: MaintenancePool = {
  sanitizer: "swg",
  hasPump: true,
  filterType: "cartridge",
  heaterType: null,
  feederType: null,
};

describe("tasksFor", () => {
  it("lists the tasks the equipment needs", () => {
    expect(tasksFor(saltCartridge).map((t) => t.id)).toEqual([
      "cell_clean",
      "pump_basket",
      "pump_oring",
      "cartridge_rinse",
      "cartridge_replace",
    ]);
    const chlorineSand: MaintenancePool = {
      sanitizer: "chlorine",
      hasPump: false,
      filterType: "sand",
      heaterType: "solar",
      feederType: "inline",
    };
    expect(tasksFor(chlorineSand).map((t) => t.id)).toEqual(["sand_backwash", "sand_replace", "feeder_refill"]);
    expect(tasksFor({ ...chlorineSand, filterType: "de", heaterType: "gas", feederType: null }).map((t) => t.id)).toEqual([
      "de_backwash",
      "de_grids",
      "heater_service",
    ]);
  });
});

describe("intervals", () => {
  const cell = taskById("cell_clean")!;
  it("uses the owner's interval when valid, else the default", () => {
    expect(intervalFor(cell, {})).toBe(90);
    expect(intervalFor(cell, { cell_clean: 60 })).toBe(60);
    expect(intervalFor(cell, { cell_clean: 0 })).toBe(90);
    expect(intervalFor(cell, { cell_clean: "60" })).toBe(90);
    expect(intervalFor(cell, null)).toBe(90);
  });

  it("reads the form and describes intervals", () => {
    expect(intervalFromForm("3", "months")).toBe(90);
    expect(intervalFromForm("5", "weeks")).toBe(35);
    expect(intervalFromForm("2", "years")).toBe(730);
    expect(intervalFromForm("0", "days")).toBeNull();
    expect(intervalFromForm("11", "years")).toBeNull();
    expect(intervalFromForm("3", "fortnights")).toBeNull();
    expect(splitInterval(90)).toEqual({ count: 3, unit: "months" });
    expect(splitInterval(10)).toEqual({ count: 10, unit: "days" });
    expect(describeInterval(7)).toBe("every week");
    expect(describeInterval(35)).toBe("every 5 weeks");
    expect(describeInterval(2190)).toBe("every 6 years");
    expect(describeInterval(1)).toBe("every day");
  });
});

describe("pressureStatus", () => {
  it("compares the latest reading with the last clean one", () => {
    // 70 kPa clean (about 10 psi), now 130 kPa: up 60 kPa (about 8.7 psi), over the 55 kPa line.
    const s = pressureStatus([
      { readOn: "2026-09-20", kpa: 130, clean: false },
      { readOn: "2026-08-01", kpa: 70, clean: true },
      { readOn: "2026-09-01", kpa: 100, clean: false },
    ]);
    expect(s?.latest.kpa).toBe(130);
    expect(s?.clean?.kpa).toBe(70);
    expect(s?.riseKpa).toBe(60);
    expect(s?.high).toBe(true);
  });

  it("is not high without a clean reading, or after a new clean one", () => {
    expect(pressureStatus([{ readOn: "2026-09-20", kpa: 200, clean: false }])?.high).toBe(false);
    const after = pressureStatus([
      { readOn: "2026-08-01", kpa: 70, clean: true },
      { readOn: "2026-09-20", kpa: 130, clean: false },
      { readOn: "2026-09-21", kpa: 72, clean: true },
    ]);
    expect(after?.riseKpa).toBe(0);
    expect(after?.high).toBe(false);
  });

  it("ignores readings from before the filter was installed", () => {
    expect(pressureStatus([{ readOn: "2026-01-01", kpa: 70, clean: true }], "2026-06-01")).toBeNull();
  });
});

describe("maintenanceStatus", () => {
  const today = "2026-10-01";

  it("works out the next due date from the last time done", () => {
    const statuses = maintenanceStatus({
      pool: saltCartridge,
      overrides: { pump_basket: 30 },
      done: [
        { task: "cell_clean", doneOn: "2026-06-01" }, // + 90 days = Aug 30: 32 days overdue
        { task: "cell_clean", doneOn: "2026-05-01" },
        { task: "pump_basket", doneOn: "2026-09-03" }, // + 30 = Oct 3: in 2 days, inside its 3-day window
        { task: "pump_oring", doneOn: "2026-03-01" }, // + 365: fine
      ],
      pressure: null,
      today,
    });
    const by = Object.fromEntries(statuses.map((s) => [s.task.id, s]));
    expect(by.cell_clean).toMatchObject({ lastDone: "2026-06-01", nextDue: "2026-08-30", daysLeft: -32, state: "overdue" });
    expect(by.pump_basket).toMatchObject({ intervalDays: 30, nextDue: "2026-10-03", daysLeft: 2, state: "soon" });
    expect(by.pump_oring.state).toBe("ok");
    expect(by.cartridge_rinse.state).toBe("unknown");
    // Most urgent first.
    expect(statuses[0].task.id).toBe("cell_clean");
    expect(dueTasks(statuses).map((s) => s.task.id)).toEqual(["cell_clean", "pump_basket"]);
    expect(dueText(by.cell_clean)).toBe("32 days overdue");
    expect(dueText(by.pump_basket)).toBe("due in 2 days");
    expect(dueText(by.cartridge_rinse)).toBe("not logged yet");
  });

  it("marks the filter clean due when the pressure is up since it was last done", () => {
    const pressure = pressureStatus([
      { readOn: "2026-09-01", kpa: 70, clean: true },
      { readOn: "2026-09-30", kpa: 130, clean: false },
    ]);
    const rinse = (doneOn: string) =>
      maintenanceStatus({ pool: saltCartridge, overrides: {}, done: [{ task: "cartridge_rinse", doneOn }], pressure, today }).find(
        (s) => s.task.id === "cartridge_rinse",
      )!;
    expect(rinse("2026-09-01")).toMatchObject({ pressureHigh: true, state: "due" });
    expect(dueText(rinse("2026-09-01"))).toBe("due now: filter pressure is up");
    // Rinsed after the high reading: no longer due from pressure.
    expect(rinse("2026-10-01")).toMatchObject({ pressureHigh: false, state: "ok" });
  });

  it("ignores completions logged for a later day", () => {
    const s = maintenanceStatus({
      pool: saltCartridge,
      overrides: {},
      done: [{ task: "cell_clean", doneOn: "2026-12-01" }],
      pressure: null,
      today,
    }).find((x) => x.task.id === "cell_clean");
    expect(s?.lastDone).toBeNull();
  });
});

describe("cellHoursUsed", () => {
  it("adds up pump hours times the cell setting, day by day", () => {
    // Installed Sep 1; 8 h a day at 100% until Sep 11, then 50%; 30 days to Oct 1.
    const used = cellHoursUsed({
      installedOn: "2026-09-01",
      today: "2026-10-01",
      schedules: [{ from: "2026-09-01T00:00:00Z", hours: 8 }],
      settings: [
        { at: "2026-09-01T10:00:00Z", percent: 100 },
        { at: "2026-09-11T10:00:00Z", percent: 50 },
      ],
    });
    // 10 days × 8 h + 20 days × 4 h = 160 h
    expect(used).toEqual({ hours: 160, extrapolated: false });
  });

  it("uses the first schedule for days before it, and says so", () => {
    const used = cellHoursUsed({
      installedOn: "2026-09-01",
      today: "2026-10-01",
      schedules: [
        { from: "2026-09-21", hours: 12 },
        { from: "2026-09-11", hours: 6 },
      ],
      settings: [],
    });
    // Sep 1–10 at the first schedule (6 h), Sep 11–20 at 6 h, Sep 21–30 at 12 h = 60 + 60 + 120
    expect(used).toEqual({ hours: 240, extrapolated: true });
  });

  it("is null without a schedule or with a future install date", () => {
    expect(cellHoursUsed({ installedOn: "2026-09-01", today: "2026-10-01", schedules: [], settings: [] })).toBeNull();
    expect(
      cellHoursUsed({ installedOn: "2026-11-01", today: "2026-10-01", schedules: [{ from: "2026-09-01", hours: 8 }], settings: [] }),
    ).toBeNull();
  });
});

describe("life", () => {
  it("compares hours with the rating", () => {
    // 3 seasons of 8 h a day for 200 days at 60%: 2,880 h of a 10,000 h Pentair cell.
    expect(cellRatedHours("Pentair IntelliChlor IC40")).toBe(10000);
    expect(cellRatedHours("CircuPool CORE35")).toBeNull();
    expect(hoursLife(2880, 10000)).toEqual({ percent: 29, state: "fine" });
    expect(hoursLife(8500, 10000)?.state).toBe("late");
    expect(hoursLife(10500, 10000)?.state).toBe("past");
    expect(hoursLife(100, 0)).toBeNull();
  });

  it("gives an age against a typical life", () => {
    expect(ageYears("2020-10-01", "2026-10-01")).toBeCloseTo(6, 1);
    expect(formatAge(ageYears("2026-03-01", "2026-10-01"))).toBe("7 months");
    expect(formatAge(1.1)).toBe("1 year");
    expect(formatAge(3.4)).toBe("3.5 years");
    expect(lifeState(6, [8, 12])).toBe("fine");
    expect(lifeState(9, [8, 12])).toBe("late");
    expect(lifeState(13, [8, 12])).toBe("past");
  });
});

describe("visual helpers", () => {
  const today = "2026-10-01";
  const statuses = maintenanceStatus({
    pool: saltCartridge,
    overrides: {},
    done: [
      { task: "cell_clean", doneOn: "2026-06-01" }, // overdue
      { task: "pump_basket", doneOn: "2026-09-29" }, // due Oct 6
      { task: "pump_oring", doneOn: "2025-11-01" }, // due Nov 1 2026 (31 days): outside 30
    ],
    pressure: null,
    today,
  });
  const by = Object.fromEntries(statuses.map((s) => [s.task.id, s]));

  it("measures the interval gone by and picks a tone", () => {
    expect(intervalProgress(by.cell_clean)).toMatchObject({ tone: "critical" });
    // 2 of 7 days gone: under 80%.
    expect(intervalProgress(by.pump_basket)).toEqual({ share: 2 / 7, tone: "good" });
    // 334 of 365 days gone: 91%.
    expect(intervalProgress(by.pump_oring)?.tone).toBe("warning");
    expect(intervalProgress(by.cartridge_rinse)).toBeNull();
  });

  it("lays the due dates over the next 30 days", () => {
    const cal = dueCalendar(statuses, today);
    expect(cal).toHaveLength(30);
    expect(cal[0].tasks).toEqual([{ label: "Inspect the salt cell", overdue: true }]);
    expect(cal[5]).toEqual({ date: "2026-10-06", tasks: [{ label: "Empty the pump basket", overdue: false }] });
    expect(cal.flatMap((d) => d.tasks).map((t) => t.label)).not.toContain("Lube the pump lid O-ring");
  });

  it("places an item on its typical life", () => {
    expect(lifeSpan("2024-10-01", today, [8, 12])).toMatchObject({ state: "fine", left: "about 8 years left" });
    expect(lifeSpan("2017-10-01", today, [8, 12])).toMatchObject({ state: "late", left: "in the usual replacement window" });
    expect(lifeSpan("2010-10-01", today, [8, 12])).toMatchObject({ state: "past", share: 1.2 });
    expect(lifeSpan("2026-01-01", today, [1, 2]).left).toBe("about 9 months left");
  });

  it("projects when the cell's rated hours run out", () => {
    // 6,000 h left at 4 h a day: 1,500 days from Oct 1 2026 is Nov 9 2030.
    expect(cellReplacementMonth({ hoursUsed: 4000, ratedHours: 10000, hoursPerDay: 4, today })).toBe("Nov 2030");
    expect(cellReplacementMonth({ hoursUsed: 4000, ratedHours: null, hoursPerDay: 4, today })).toBeNull();
    expect(cellReplacementMonth({ hoursUsed: 12000, ratedHours: 10000, hoursPerDay: 4, today })).toBeNull();
    expect(cellReplacementMonth({ hoursUsed: 0, ratedHours: 10000, hoursPerDay: 0, today })).toBeNull();
  });
});

describe("healthItems", () => {
  it("uses rated hours for the cell when known, age otherwise", () => {
    const items = healthItems({
      today: "2026-10-01",
      cell: { installedOn: "2023-05-01", hoursUsed: 8500, ratedHours: 10000 },
      equipment: [{ kind: "pump", type: null, installedOn: "2019-10-01", label: "Pump" }],
    });
    expect(items[0]).toEqual({ label: "Salt cell", share: 0.85, tone: "warning", text: "85% of rated hours" });
    expect(items[1]).toMatchObject({ label: "Pump", tone: "good", text: "about 3 years left" });
    const byAge = healthItems({ today: "2026-10-01", cell: { installedOn: "2023-10-01", hoursUsed: null, ratedHours: null }, equipment: [] });
    // 3 years into a typical 3–7: in the replacement window.
    expect(byAge[0]).toMatchObject({ label: "Salt cell", tone: "warning", text: "in the usual replacement window" });
  });
});
