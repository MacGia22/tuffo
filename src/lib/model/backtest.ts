import { fitChlorineModel, predictNextFc, type Prior } from "@/engine/server";
import { observationsFrom, type TestPair } from "./observations";

/**
 * Walk-forward backtest: for each test pair, fit on the pairs before it only, predict
 * the free chlorine the second test should find, and compare with what it found.
 */

export interface BacktestPoint {
  /** Usable pairs the prediction was fitted on. */
  pairsBefore: number;
  predicted: number;
  actual: number;
  error: number;
  /** Error of the same prediction from the prior alone (no pool data), for comparison. */
  priorOnlyError: number;
}

/** Pairs whose second test can be predicted: known drivers, no water change, not too far apart. */
function predictable(pair: TestPair): boolean {
  return pair.drivers !== null && (pair.skip === null || pair.skip === "bottomed");
}

export function backtestPool(pairs: TestPair[], prior: Prior): BacktestPoint[] {
  const priorOnly = fitChlorineModel([], prior).coefficients;
  const points: BacktestPoint[] = [];
  for (let k = 0; k < pairs.length; k += 1) {
    const pair = pairs[k];
    if (!predictable(pair) || !pair.drivers) continue;
    const history = observationsFrom(pairs.slice(0, k));
    const fit = fitChlorineModel(history, prior);
    const start = { fc: pair.fcStart, addedPpm: pair.addedPpm, days: pair.days, drivers: pair.drivers };
    const predicted = predictNextFc(fit.coefficients, start);
    points.push({
      pairsBefore: history.length,
      predicted,
      actual: pair.fcEnd,
      error: Math.abs(predicted - pair.fcEnd),
      priorOnlyError: Math.abs(predictNextFc(priorOnly, start) - pair.fcEnd),
    });
  }
  return points;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export interface BacktestSummary {
  /** Predictions made with at least `minPairs` pairs of history. */
  predictions: number;
  medianError: number | null;
  medianPriorOnlyError: number | null;
  /** The public-launch gate: median error of 1.0 ppm or less. */
  meetsGate: boolean | null;
}

export const GATE_MEDIAN_ERROR_PPM = 1.0;

export function summarizeBacktest(points: BacktestPoint[], minPairs = 4): BacktestSummary {
  const counted = points.filter((p) => p.pairsBefore >= minPairs);
  const medianError = median(counted.map((p) => p.error));
  return {
    predictions: counted.length,
    medianError,
    medianPriorOnlyError: median(counted.map((p) => p.priorOnlyError)),
    meetsGate: medianError === null ? null : medianError <= GATE_MEDIAN_ERROR_PPM,
  };
}
