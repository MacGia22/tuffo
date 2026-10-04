import "server-only";

import {
  DEFAULT_CYA,
  doseFor,
  doseForPh,
  effectsOf,
  PLAN_MAX_ADDITION_PPM,
  saturationIndex,
  saturationVerdict,
  targetsFor,
  type Dose,
  type SaturationVerdict,
  type Targets,
} from "@/engine/server";
import { acidFor, catalogProduct, productShort } from "@/lib/catalog";
import { cellSettingText } from "@/lib/salt-cells";

/**
 * Turns the latest test into plain recommendations. Pure given its inputs; the
 * engine does the chemistry, this file decides what is worth saying and in what
 * order. Always advisory: the user decides.
 */

export interface AdvicePool {
  volumeL: number;
  sanitizer: "chlorine" | "swg";
  surface: "plaster" | "vinyl" | "fiberglass";
  /** Product names: metric pools get the names on Australian shelves ("pool acid"). Default "us". */
  units?: "us" | "metric";
  /** The salt range the chlorinator asks for, ppm; absent or null: 2,800-3,600. */
  saltTarget?: { low: number; high: number } | null;
  /** The cell is set in levels 1 to this many (wording only); absent or null: percent. */
  cellLevels?: number | null;
}

export interface AdviceReading {
  fc: number | null;
  cc: number | null;
  ph: number | null;
  ta: number | null;
  ch: number | null;
  cya: number | null;
  salt: number | null;
  waterTempC: number | null;
  borate: number | null;
}

export type Severity = "act" | "watch" | "ok";

export interface Recommendation {
  measure: "fc" | "cc" | "ph" | "ta" | "ch" | "cya" | "salt" | "csi";
  severity: Severity;
  title: string;
  detail: string;
  dose?: Dose;
}

/** A product logged after the test the advice is based on. */
export interface LoggedDose {
  productId: string;
  /** In the engine's base unit (g or mL). */
  amount: number;
  /** As the person measured it: "1 lb". */
  amountText: string;
  /** When, in the pool's time zone: "Sep 27". */
  dateText: string;
  /** When it was added (ISO); without it, the dose counts as after every test. */
  addedAt?: string;
}

/** Measures that drift over weeks and are tested monthly, often not with the latest test. */
export type SlowMeasure = "ta" | "ch" | "cya" | "salt";
/** Measures whose value can come from a test other than the latest. */
export type AdviceMeasure = "fc" | "ph" | SlowMeasure;

/**
 * Where the reading's values come from: each measure from its newest test (combined
 * chlorine with free chlorine), which need not be the latest test.
 */
export interface AdviceContext {
  /** When the latest test was taken (ISO). */
  testedAt?: string;
  /** When a measure's value was tested, when that was before the latest test. */
  valueTestedAt?: Partial<Record<AdviceMeasure, string>>;
  /** Values past their retest age: they still set targets and doses, without a card of their own. */
  stale?: Partial<Record<AdviceMeasure, boolean>>;
}

/**
 * Salt pools: the cell setting from the 7-day plan (lowest output that holds free
 * chlorine this week), or null when the cell's rated output is not known.
 */
export interface CellSetting {
  percent: number | null;
  /** What is missing for a percent: the cell's rating or the pump schedule. */
  missing?: "rating" | "pump";
  /** Chlorine the cell has to make per day, ppm. */
  needPpm: number | null;
}

export interface Advice {
  targets: Targets;
  assumptions: string[];
  items: Recommendation[];
  /** The saturation index the card shows, for the line under the tiles; null without pH, TA and CH. */
  csi: { value: number; verdict: SaturationVerdict; assumedTemp: boolean } | null;
}

const DEFAULT_TA = 80;
/** Combined chlorine above this is worth acting on (0.5 itself is fine). */
const CC_MAX = 0.5;
/** Goes with every dose the advice gives. */
export const NEVER_MIX_NOTE =
  "Add one product at a time, straight into the pool with the pump running, never mixed with another: chlorine and acid together give off chlorine gas.";
/** The temperature the saturation index assumes without a reading, °C. */
const DEFAULT_TEMP_C = 27;

function listDoses(doses: LoggedDose[], withName: boolean): string {
  const parts = doses.map((d) => {
    const name = catalogProduct(d.productId)?.short ?? d.productId;
    return `${d.amountText}${withName ? ` of ${name}` : ""} from ${d.dateText}`;
  });
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0];
}

function retestNote(measure: Recommendation["measure"], what: string, value: string, doses: LoggedDose[]): Recommendation {
  return {
    measure,
    severity: "watch",
    title: `Retest ${what} before adding more`,
    detail: `This test read ${value}, before your ${listDoses(doses, true)}. Give it a few hours to mix, then test again.`,
  };
}

/**
 * `since` holds the products logged after the tests the values come from (see
 * `context`). Their effect on chlorine and pH is unknown until the next test, so those
 * cards ask for a retest instead of a dose. Stabilizer, calcium and salt add up
 * predictably and nothing uses them up in a day or two, so they are counted: the card
 * shows the level with the addition and never offers the same dose again.
 */
export function adviseFor(
  pool: AdvicePool,
  r: AdviceReading,
  since: LoggedDose[] = [],
  cell?: CellSetting,
  context: AdviceContext = {},
): Advice {
  const assumptions: string[] = [];
  const cya = r.cya ?? DEFAULT_CYA;
  if (r.cya === null) assumptions.push(`No stabilizer (CYA) test yet; targets assume ${DEFAULT_CYA} ppm.`);
  const ta = r.ta ?? DEFAULT_TA;
  if (r.ta === null && r.ph !== null) assumptions.push(`No alkalinity test yet; pH doses assume TA ${DEFAULT_TA} ppm.`);

  const swg = pool.sanitizer === "swg";
  const targets = targetsFor({ swg, surface: pool.surface, cya, saltTarget: pool.saltTarget });
  const units = pool.units ?? "us";
  // Metric pools: pool acid 32% (hydrochloric) and "baking soda (buffer)", as Australian shops sell them.
  const acid = acidFor(units);
  const acidName = productShort(acid, units);
  const bakingSoda = productShort("baking-soda", units);
  const settingText = (percent: number) => cellSettingText(percent, pool.cellLevels);
  const items: Recommendation[] = [];
  const L = pool.volumeL;
  // A dose counts for a value when it was added after the test that value comes from (one
  // logged at the test's own moment came after it: test, then dose).
  const after = (iso: string | undefined) => (d: LoggedDose) =>
    !iso || !d.addedAt || Date.parse(d.addedAt) >= Date.parse(iso);
  const testedAt = (m: AdviceMeasure) => context.valueTestedAt?.[m] ?? context.testedAt;
  const sinceTest = (m: AdviceMeasure) => since.filter(after(testedAt(m)));
  const inGroup = (doses: LoggedDose[], ...groups: string[]) =>
    doses.filter((d) => groups.includes(catalogProduct(d.productId)?.group ?? ""));
  const chlorineSince = inGroup(sinceTest("fc"), "Chlorine");
  const phSince = inGroup(sinceTest("ph"), "Lower pH", "Raise pH or alkalinity");
  const taPhSince = inGroup(sinceTest("ta"), "Lower pH", "Raise pH or alkalinity");
  const effectOf = (d: LoggedDose, measure: "cya" | "ch" | "salt") => {
    try {
      return effectsOf(d.productId, d.amount, L)[measure] ?? 0;
    } catch {
      return 0;
    }
  };
  const raising = (measure: "cya" | "ch" | "salt") => sinceTest(measure).filter((d) => effectOf(d, measure) > 0);
  const added = (doses: LoggedDose[], measure: "cya" | "ch" | "salt") =>
    doses.reduce((sum, d) => sum + effectOf(d, measure), 0);
  /** "Counts your 10 lb from Sep 27." Names the product when it is not the obvious one. */
  const countsYour = (doses: LoggedDose[], obvious: string[]) =>
    `Counts your ${listDoses(doses, doses.some((d) => !obvious.includes(d.productId)))}.`;
  const cyaSince = raising("cya");
  // Calcium products only: cal-hypo adds a little calcium with every dose, not worth a card.
  const chSince = inGroup(raising("ch"), "Calcium");
  const saltSince = raising("salt");
  const card = (m: AdviceMeasure) => !context.stale?.[m];

  // Salt pools: where to set the cell, when the plan knows.
  const setting = cell?.percent !== null && cell?.percent !== undefined ? cell.percent : null;
  const need = cell?.needPpm !== null && cell?.needPpm !== undefined ? ` (it needs to make about ${cell.needPpm.toFixed(1)} ppm a day)` : "";
  const unknownCell =
    swg && cell && cell.percent === null
      ? cell.missing === "pump"
        ? " Add your pump schedule on the pool page to get a setting in percent."
        : " Add your cell's rated output on the pool page to get a setting in percent."
      : "";

  // Free chlorine
  if (!card("fc")) {
    // Past its retest age: the test card asks for a test instead.
  } else if (r.fc !== null && chlorineSince.length > 0) {
    items.push(retestNote("fc", "free chlorine", `${r.fc.toFixed(1)} ppm`, chlorineSince));
  } else if (r.fc !== null) {
    const { min, targetLow, targetHigh, slam } = targets.fc;
    const aim = (targetLow + targetHigh) / 2;
    // At most the plan's 8 ppm in one addition; the rest after a retest.
    const raise = aim - r.fc;
    const fcDose = doseFor("liquid-chlorine-12.5", Math.min(raise, PLAN_MAX_ADDITION_PPM), L);
    if (raise > PLAN_MAX_ADDITION_PPM) {
      fcDose.notes.push(
        `That is ${PLAN_MAX_ADDITION_PPM} ppm, the most in one addition; test again in a few hours and add the rest (about ${(raise - PLAN_MAX_ADDITION_PPM).toFixed(1)} ppm) if it is still low.`,
      );
    }
    if (r.fc < min) {
      items.push({
        measure: "fc",
        severity: "act",
        title: `Free chlorine ${r.fc.toFixed(1)} ppm is below the minimum of ${min} ppm`,
        detail: swg
          ? `Boost now with liquid chlorine to about ${aim.toFixed(1)} ppm, then raise the chlorinator output${setting !== null ? ` to about ${settingText(setting)}${need}` : ""}.${unknownCell}`
          : `Bring it to about ${aim.toFixed(1)} ppm now; below the minimum, algae gets a head start.`,
        dose: fcDose,
      });
    } else if (r.fc < targetLow) {
      items.push({
        measure: "fc",
        severity: "act",
        title: `Free chlorine ${r.fc.toFixed(1)} ppm is under the ${targetLow}–${targetHigh} ppm target`,
        detail: swg
          ? setting !== null
            ? `Set the chlorinator to about ${settingText(setting)}${need}, or top up with liquid chlorine.`
            : `Nudge the chlorinator output up a step, or top up with liquid chlorine.${unknownCell}`
          : `Top up to about ${aim.toFixed(1)} ppm.`,
        dose: fcDose,
      });
    } else if (r.fc > slam) {
      items.push({
        measure: "fc",
        severity: "watch",
        title: `Free chlorine ${r.fc.toFixed(1)} ppm is at shock level`,
        detail: swg
          ? `Fine if you are clearing algae; otherwise turn the chlorinator output down${setting !== null ? ` to about ${settingText(setting)}` : ""} and let it drift down before swimming.`
          : "Fine if you are clearing algae; otherwise let it drift down before swimming.",
      });
    } else if (r.fc > targetHigh) {
      items.push({
        measure: "fc",
        severity: "ok",
        title: `Free chlorine ${r.fc.toFixed(1)} ppm is above target; nothing to add`,
        detail: swg
          ? setting !== null
            ? `Turn the chlorinator down to about ${settingText(setting)}${need} and retest in a day or two.`
            : `Turn the chlorinator output down a step and retest in a day or two.${unknownCell}`
          : "Sun will bring it down. Skip the next dose and retest.",
      });
    } else {
      items.push({
        measure: "fc",
        severity: "ok",
        title: `Free chlorine ${r.fc.toFixed(1)} ppm is on target (${targetLow}–${targetHigh} ppm)`,
        detail: swg
          ? setting !== null
            ? `The plan suggests about ${settingText(setting)} for this week's weather${need}.`
            : `Keep the chlorinator where it is.${unknownCell}`
          : "Keep the daily dose you have been adding.",
      });
    }
  }

  // Combined chlorine (from the free chlorine test)
  if (card("fc") && r.cc !== null && r.cc > CC_MAX) {
    items.push({
      measure: "cc",
      severity: r.cc >= 1 ? "act" : "watch",
      title: `Combined chlorine ${r.cc.toFixed(1)} ppm`,
      detail:
        r.cc >= 1
          ? "Something is being oxidised (algae, sweat, sunscreen). Test overnight chlorine loss; if FC drops more than 1 ppm, start a SLAM."
          : "Slightly elevated. Keep FC at target and retest in a day or two.",
    });
  }

  // pH. The TA a pH dose changes (soda ash raises it, acid lowers it) is counted on the TA card.
  let taFromPhDose = 0;
  if (!card("ph")) {
    // Past its retest age.
  } else if (r.ph !== null && phSince.length > 0) {
    items.push(retestNote("ph", "pH", r.ph.toFixed(2), phSince));
  } else if (r.ph !== null) {
    const { low, high, ideal } = targets.ph;
    const waterReading = { pH: r.ph, ta, cya: r.cya ?? undefined, borate: r.borate ?? undefined };
    if (r.ph > high) {
      const dose = doseForPh(acid, { ...waterReading, liters: L, targetPh: ideal });
      taFromPhDose = dose.effects.ta ?? 0;
      items.push({
        measure: "ph",
        severity: "act",
        title: `pH ${r.ph.toFixed(2)} is high`,
        detail: `Lower it to ${ideal.toFixed(1)} with ${acidName}. High pH weakens chlorine and scales heaters.`,
        dose,
      });
    } else if (r.ph < low) {
      const dose = doseForPh("soda-ash", { ...waterReading, liters: L, targetPh: ideal });
      if (ta <= targets.ta.high) taFromPhDose = dose.effects.ta ?? 0;
      items.push({
        measure: "ph",
        severity: "act",
        title: `pH ${r.ph.toFixed(2)} is low`,
        detail:
          ta > targets.ta.high
            ? `Raise it to ${ideal.toFixed(1)} by aeration (fountain, jets pointed up): TA is already high, so skip soda ash.`
            : `Raise it to ${ideal.toFixed(1)} with soda ash.`,
        dose: ta > targets.ta.high ? undefined : dose,
      });
    } else {
      items.push({
        measure: "ph",
        severity: "ok",
        title: `pH ${r.ph.toFixed(2)} is in range`,
        detail: `Target ${low}–${high}.`,
      });
    }
  }

  // Total alkalinity
  if (r.ta !== null && card("ta")) {
    const { low, high } = targets.ta;
    if ((r.ta < low || r.ta > high + 30) && taPhSince.length > 0) {
      items.push(retestNote("ta", "alkalinity", `${Math.round(r.ta)} ppm`, taPhSince));
    } else if (r.ta < low) {
      const aim = low + 10;
      const withPhDose = r.ta + taFromPhDose;
      const product = taFromPhDose > 0 ? "soda ash" : "acid";
      if (taFromPhDose !== 0 && withPhDose >= aim) {
        items.push({
          measure: "ta",
          severity: "watch",
          title: `Alkalinity ${Math.round(r.ta)} ppm is low`,
          detail: `The ${product} for pH brings it to about ${Math.round(withPhDose)} ppm; retest it a day after.`,
        });
      } else {
        const dose = doseFor("baking-soda", aim - withPhDose, L);
        items.push({
          measure: "ta",
          severity: "watch",
          title: `Alkalinity ${Math.round(r.ta)} ppm is low`,
          detail:
            taFromPhDose === 0
              ? `Raise it toward ${aim} ppm with ${bakingSoda}; low TA lets pH swing.`
              : `Raise it toward ${aim} ppm with ${bakingSoda}, counting the ${product} for pH (about ${Math.round(withPhDose)} ppm after it); low TA lets pH swing.`,
          dose,
        });
      }
    } else if (r.ta > high + 30) {
      items.push({
        measure: "ta",
        severity: "watch",
        title: `Alkalinity ${Math.round(r.ta)} ppm is high`,
        detail: `Lower it over time: ${acidName} to pH 7.0–7.2, then aerate back up. Repeat.`,
      });
    }
  }

  // Calcium hardness. Calcium logged since the test is counted; a card appears only when
  // the test itself was out of range or the addition took it too high (cal-hypo adds a
  // little calcium with every dose, which is not worth a card on its own).
  const chNow = r.ch === null ? null : r.ch + added(chSince, "ch");
  if (!card("ch")) {
    // Past its retest age: the retest is the advice, not a dose from an old number.
  } else if (r.ch !== null && chNow !== null && chSince.length > 0 && (r.ch < targets.ch.low || chNow > targets.ch.high + 100)) {
    const { low, high } = targets.ch;
    const counted = countsYour(chSince, ["calcium-chloride-77", "calcium-chloride-97"]);
    const plaster = pool.surface === "plaster";
    items.push(
      chNow < low
        ? {
            measure: "ch",
            severity: plaster ? "watch" : "ok",
            title: `Calcium about ${Math.round(chNow)} ppm is still low`,
            detail: plaster
              ? `${counted} Let it mix for a day, then retest before adding more.`
              : `${counted} Not a problem for a vinyl or fiberglass pool.`,
          }
        : chNow > high + 100
          ? {
              measure: "ch",
              severity: "watch",
              title: `Calcium about ${Math.round(chNow)} ppm is high`,
              detail: `${counted} Only water replacement lowers it. Keep pH on the low side of range to avoid scale.`,
            }
          : {
              measure: "ch",
              severity: "ok",
              title: `Calcium about ${Math.round(chNow)} ppm is in range`,
              detail: `${counted} Retest in a day, once it has mixed.`,
            },
    );
  } else if (r.ch !== null) {
    const { low, high } = targets.ch;
    // Cal-hypo logged since the test (the only calcium here) is taken off the dose.
    const fromCalHypo = added(raising("ch"), "ch");
    const short = low + 50 - r.ch - fromCalHypo;
    if (r.ch < low && short > 0) {
      const dose = doseFor("calcium-chloride-77", short, L);
      const counted = fromCalHypo >= 1 ? ` The dose counts about ${Math.round(fromCalHypo)} ppm from the cal-hypo added since.` : "";
      items.push({
        measure: "ch",
        severity: pool.surface === "plaster" ? "act" : "ok",
        title: `Calcium ${Math.round(r.ch)} ppm is low`,
        detail:
          pool.surface === "plaster"
            ? `Raise it to about ${low + 50} ppm with calcium chloride to protect the plaster.${counted}`
            : "Not a problem for a vinyl or fiberglass pool.",
        dose: pool.surface === "plaster" ? dose : undefined,
      });
    } else if (r.ch > high + 100) {
      items.push({
        measure: "ch",
        severity: "watch",
        title: `Calcium ${Math.round(r.ch)} ppm is high`,
        detail: "Only water replacement lowers it. Keep pH on the low side of range to avoid scale.",
      });
    }
  }

  // Stabilizer
  if (!card("cya")) {
    // Past its retest age: it still sets the chlorine targets above.
  } else if (r.cya !== null && cyaSince.length > 0) {
    const { low, high } = targets.cya;
    const cyaNow = r.cya + added(cyaSince, "cya");
    const counted = countsYour(cyaSince, ["cyanuric-acid"]);
    items.push(
      cyaNow < low
        ? {
            measure: "cya",
            severity: "watch",
            title: `Stabilizer about ${Math.round(cyaNow)} ppm is still low`,
            detail: `${counted} It takes days to dissolve; retest in about a week before adding more.`,
          }
        : cyaNow > high + 20
          ? {
              measure: "cya",
              severity: "watch",
              title: `Stabilizer about ${Math.round(cyaNow)} ppm is high`,
              detail: `${counted} Chlorine targets go up with it; retest in about a week.`,
            }
          : {
              measure: "cya",
              severity: "ok",
              title: `Stabilizer about ${Math.round(cyaNow)} ppm is in range`,
              detail: `${counted} Retest in about a week, once it has dissolved.`,
            },
    );
  } else if (r.cya !== null) {
    const { low, high } = targets.cya;
    if (r.cya < low) {
      const dose = doseFor("cyanuric-acid", low + 10 - r.cya, L);
      items.push({
        measure: "cya",
        severity: "act",
        title: `Stabilizer ${Math.round(r.cya)} ppm is low`,
        detail: `Raise it to about ${low + 10} ppm; without it the sun burns chlorine off in hours.`,
        dose,
      });
    } else if (r.cya > high + 20) {
      items.push({
        measure: "cya",
        severity: "watch",
        title: `Stabilizer ${Math.round(r.cya)} ppm is high`,
        detail: "Chlorine targets go up with it. Only draining and refilling lowers CYA; avoid trichlor pucks and dichlor.",
      });
    }
  }

  // Salt (SWG only). Salt logged since the test is counted, as for calcium.
  const saltNow = r.salt === null ? null : r.salt + added(saltSince, "salt");
  if (!card("salt")) {
    // Past its retest age.
  } else if (
    swg &&
    r.salt !== null &&
    saltNow !== null &&
    targets.salt &&
    saltSince.length > 0 &&
    (r.salt < targets.salt.low || saltNow > targets.salt.high)
  ) {
    const { low, high } = targets.salt;
    const counted = countsYour(saltSince, ["salt"]);
    items.push(
      saltNow < low
        ? {
            measure: "salt",
            severity: "watch",
            title: `Salt about ${Math.round(saltNow)} ppm is still below the chlorinator's ${low.toLocaleString("en-US")}–${high.toLocaleString("en-US")} ppm`,
            detail: `${counted} Let it dissolve and circulate for a day, then retest before adding more.`,
          }
        : saltNow > high
          ? {
              measure: "salt",
              severity: "watch",
              title: `Salt about ${Math.round(saltNow)} ppm is above the ${low.toLocaleString("en-US")}–${high.toLocaleString("en-US")} ppm range`,
              detail: `${counted} Rain and refills will dilute it; no action unless the cell complains.`,
            }
          : {
              measure: "salt",
              severity: "ok",
              title: `Salt about ${Math.round(saltNow)} ppm is in range`,
              detail: `${counted} Retest after a day of circulation.`,
            },
    );
  } else if (swg && r.salt !== null && targets.salt) {
    const { low, high } = targets.salt;
    if (r.salt < low) {
      const dose = doseFor("salt", (low + high) / 2 - r.salt, L);
      items.push({
        measure: "salt",
        severity: "act",
        title: `Salt ${Math.round(r.salt)} ppm is below the chlorinator's ${low.toLocaleString("en-US")}–${high.toLocaleString("en-US")} ppm`,
        detail: pool.saltTarget
          ? `Add pool salt to reach about ${Math.round((low + high) / 2).toLocaleString("en-US")} ppm, the middle of the ${low.toLocaleString("en-US")}–${high.toLocaleString("en-US")} ppm your chlorinator asks for.`
          : `Add pool salt to reach about ${Math.round((low + high) / 2).toLocaleString("en-US")} ppm. Most cells want ${low.toLocaleString("en-US")}–${high.toLocaleString("en-US")} ppm; if yours asks for another level, set it in the pool's settings.`,
        dose,
      });
    } else if (r.salt > high) {
      items.push({
        measure: "salt",
        severity: "watch",
        title: `Salt ${Math.round(r.salt)} ppm is above the ${low.toLocaleString("en-US")}–${high.toLocaleString("en-US")} ppm range`,
        detail: pool.saltTarget
          ? "Rain and refills will dilute it; no action unless the cell complains."
          : "Rain and refills will dilute it; no action unless the cell complains. If your chlorinator asks for more salt, set its level in the pool's settings.",
      });
    }
  }

  // Saturation index
  let csiResult: Advice["csi"] = null;
  if (r.ph !== null && r.ta !== null && r.ch !== null) {
    const csi = saturationIndex({
      pH: r.ph,
      ta: r.ta,
      ch: r.ch,
      cya: r.cya ?? undefined,
      borate: r.borate ?? undefined,
      tempC: r.waterTempC ?? DEFAULT_TEMP_C,
      salt: r.salt ?? undefined,
    });
    const verdict = saturationVerdict(csi);
    csiResult = { value: csi, verdict, assumedTemp: r.waterTempC === null };
  }
  // A card only while pH, TA and CH are all current (the line under the tiles still shows it).
  if (csiResult && card("ph") && card("ta") && card("ch")) {
    const { value: csi, verdict } = csiResult;
    if (r.waterTempC === null) assumptions.push("No water temperature; the saturation index assumes 27 °C (81 °F).");
    items.push({
      measure: "csi",
      severity: verdict === "balanced" ? "ok" : pool.surface === "plaster" ? "watch" : "ok",
      title: `Saturation index ${csi >= 0 ? "+" : ""}${csi.toFixed(2)} (${verdict})`,
      detail:
        verdict === "corrosive"
          ? "Water is hungry for calcium: hard on plaster and grout. Raising CH or pH fixes it."
          : verdict === "scaling"
            ? "Water tends to leave scale, especially in a heater or salt cell. Lower pH a little."
            : "Water is neither dissolving plaster nor leaving scale.",
    });
  }

  const order: Record<Severity, number> = { act: 0, watch: 1, ok: 2 };
  items.sort((a, b) => order[a.severity] - order[b.severity]);
  for (const item of items) {
    if (item.dose && !item.dose.notes.includes(NEVER_MIX_NOTE)) item.dose.notes = [...item.dose.notes, NEVER_MIX_NOTE];
  }
  return { targets, assumptions, items, csi: csiResult };
}
