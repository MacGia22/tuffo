import "server-only";

import {
  doseFor,
  doseForPh,
  saturationIndex,
  saturationVerdict,
  targetsFor,
  type Dose,
  type Targets,
} from "@/engine/server";

/**
 * Turns the latest test into plain recommendations. Pure given its inputs; the
 * engine does the chemistry, this file decides what is worth saying and in what
 * order. Always advisory: the user decides.
 */

export interface AdvicePool {
  volumeL: number;
  sanitizer: "chlorine" | "swg";
  surface: "plaster" | "vinyl" | "fiberglass";
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

export interface Advice {
  targets: Targets;
  assumptions: string[];
  items: Recommendation[];
}

const DEFAULT_CYA = 30;
const DEFAULT_TA = 80;

export function adviseFor(pool: AdvicePool, r: AdviceReading): Advice {
  const assumptions: string[] = [];
  const cya = r.cya ?? DEFAULT_CYA;
  if (r.cya === null) assumptions.push(`No stabilizer (CYA) test yet; targets assume ${DEFAULT_CYA} ppm.`);
  const ta = r.ta ?? DEFAULT_TA;
  if (r.ta === null && r.ph !== null) assumptions.push(`No alkalinity test yet; pH doses assume TA ${DEFAULT_TA} ppm.`);

  const swg = pool.sanitizer === "swg";
  const targets = targetsFor({ swg, surface: pool.surface, cya });
  const items: Recommendation[] = [];
  const L = pool.volumeL;

  // Free chlorine
  if (r.fc !== null) {
    const { min, targetLow, targetHigh, slam } = targets.fc;
    const aim = (targetLow + targetHigh) / 2;
    if (r.fc < min) {
      items.push({
        measure: "fc",
        severity: "act",
        title: `Free chlorine ${r.fc.toFixed(1)} ppm is below the minimum of ${min} ppm`,
        detail: swg
          ? `Boost now with liquid chlorine to about ${aim.toFixed(1)} ppm, then raise the chlorinator output.`
          : `Bring it to about ${aim.toFixed(1)} ppm now; below the minimum, algae gets a head start.`,
        dose: doseFor("liquid-chlorine-12.5", aim - r.fc, L),
      });
    } else if (r.fc < targetLow) {
      items.push({
        measure: "fc",
        severity: "act",
        title: `Free chlorine ${r.fc.toFixed(1)} ppm is under the ${targetLow}–${targetHigh} ppm target`,
        detail: swg
          ? "Nudge the chlorinator output up a step, or top up with liquid chlorine."
          : `Top up to about ${aim.toFixed(1)} ppm.`,
        dose: doseFor("liquid-chlorine-12.5", aim - r.fc, L),
      });
    } else if (r.fc > slam) {
      items.push({
        measure: "fc",
        severity: "watch",
        title: `Free chlorine ${r.fc.toFixed(1)} ppm is at shock level`,
        detail: "Fine if you are clearing algae; otherwise let it drift down before swimming.",
      });
    } else if (r.fc > targetHigh) {
      items.push({
        measure: "fc",
        severity: "ok",
        title: `Free chlorine ${r.fc.toFixed(1)} ppm is above target; nothing to add`,
        detail: "Sun will bring it down. Skip the next dose and retest.",
      });
    } else {
      items.push({
        measure: "fc",
        severity: "ok",
        title: `Free chlorine ${r.fc.toFixed(1)} ppm is on target (${targetLow}–${targetHigh} ppm)`,
        detail: swg ? "Keep the chlorinator where it is." : "Keep the daily dose you have been adding.",
      });
    }
  }

  // Combined chlorine
  if (r.cc !== null && r.cc >= 0.5) {
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

  // pH
  if (r.ph !== null) {
    const { low, high, ideal } = targets.ph;
    const waterReading = { pH: r.ph, ta, cya: r.cya ?? undefined, borate: r.borate ?? undefined };
    if (r.ph > high) {
      const dose = doseForPh("muriatic-acid-31.45", { ...waterReading, liters: L, targetPh: ideal });
      items.push({
        measure: "ph",
        severity: "act",
        title: `pH ${r.ph.toFixed(2)} is high`,
        detail: `Lower it to ${ideal.toFixed(1)} with muriatic acid. High pH weakens chlorine and scales heaters.`,
        dose,
      });
    } else if (r.ph < low) {
      const dose = doseForPh("soda-ash", { ...waterReading, liters: L, targetPh: ideal });
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
  if (r.ta !== null) {
    const { low, high } = targets.ta;
    if (r.ta < low) {
      const dose = doseFor("baking-soda", low + 10 - r.ta, L);
      items.push({
        measure: "ta",
        severity: "watch",
        title: `Alkalinity ${Math.round(r.ta)} ppm is low`,
        detail: `Raise it toward ${low + 10} ppm with baking soda; low TA lets pH swing.`,
        dose,
      });
    } else if (r.ta > high + 30) {
      items.push({
        measure: "ta",
        severity: "watch",
        title: `Alkalinity ${Math.round(r.ta)} ppm is high`,
        detail: "Lower it over time: muriatic acid to pH 7.0–7.2, then aerate back up. Repeat.",
      });
    }
  }

  // Calcium hardness
  if (r.ch !== null) {
    const { low, high } = targets.ch;
    if (r.ch < low) {
      const dose = doseFor("calcium-chloride-77", low + 50 - r.ch, L);
      items.push({
        measure: "ch",
        severity: pool.surface === "plaster" ? "act" : "ok",
        title: `Calcium ${Math.round(r.ch)} ppm is low`,
        detail:
          pool.surface === "plaster"
            ? `Raise it to about ${low + 50} ppm with calcium chloride to protect the plaster.`
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
  if (r.cya !== null) {
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

  // Salt (SWG only)
  if (swg && r.salt !== null && targets.salt) {
    const { low, high } = targets.salt;
    if (r.salt < low) {
      const dose = doseFor("salt", (low + high) / 2 - r.salt, L);
      items.push({
        measure: "salt",
        severity: "act",
        title: `Salt ${Math.round(r.salt)} ppm is below the chlorinator's range`,
        detail: `Add pool salt to reach about ${Math.round((low + high) / 2)} ppm; check your unit's own range.`,
        dose,
      });
    } else if (r.salt > high) {
      items.push({
        measure: "salt",
        severity: "watch",
        title: `Salt ${Math.round(r.salt)} ppm is above range`,
        detail: "Rain and refills will dilute it; no action unless the cell complains.",
      });
    }
  }

  // Saturation index
  if (r.ph !== null && r.ta !== null && r.ch !== null) {
    const csi = saturationIndex({
      pH: r.ph,
      ta: r.ta,
      ch: r.ch,
      cya: r.cya ?? undefined,
      borate: r.borate ?? undefined,
      tempC: r.waterTempC ?? 27,
      salt: r.salt ?? undefined,
    });
    const verdict = saturationVerdict(csi);
    if (r.waterTempC === null) assumptions.push("No water temperature; the saturation index assumes 27 °C (80 °F).");
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
  return { targets, assumptions, items };
}
