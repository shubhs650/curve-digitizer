import { fitPrepared, MIN_POINTS, prepareData } from './fit.ts';
import type { FitHooks, FitResult, FitSpaces, ModelSpec } from './types.ts';

/** Highest polynomial degree offered (docs/PRD.md §4.8). */
export const MAX_DEGREE = 9;

/** Rational orders (numerator/denominator degree) the recommendation tries. */
export const RATIONAL_ORDERS: readonly (readonly [number, number])[] = [
  [1, 1],
  [2, 1],
  [2, 2],
];

/**
 * The candidate models for these axes. A two-parameter law that is a straight line in fit space replaces the
 * degree-1 polynomial, which would be the same curve under a second name: a power law on log–log axes, an
 * exponential on a log y axis, a logarithm on a log x axis.
 */
export function candidateSpecs(space: FitSpaces, n: number): ModelSpec[] {
  const lineTwin =
    (space.x === 'log' && space.y === 'log') ||
    (space.x === 'lin' && space.y === 'log') ||
    (space.x === 'log' && space.y === 'lin');
  const specs: ModelSpec[] = [];
  for (let degree = lineTwin ? 2 : 1; degree <= Math.min(MAX_DEGREE, n - 3); degree++) {
    specs.push({ model: 'poly', degree });
  }
  specs.push({ model: 'power' }, { model: 'exp' }, { model: 'log' });
  for (const [num, den] of RATIONAL_ORDERS) specs.push({ model: 'rational', num, den });
  specs.push({ model: 'spline', knots: 'auto' }, { model: 'pchip', knots: 'auto' });
  specs.push({ model: 'piecewise', breakpoints: 'auto' });
  return specs;
}

/**
 * Recommend the fewest-parameter fit whose AICc is within this much of the lowest: the simplest model the data do
 * not rule out (Burnham & Anderson: ΔAICc > 10 means essentially no support). Taking the bare minimum of ~20
 * candidates fits noise: on data drawn from a two-parameter law some flexible model wins by chance about one time
 * in six. Measured over 1120 seeded random draws of the A7 families (docs/DECISIONS.md ADR 39) this recommends the
 * true family 99.4 % of the time (98.1 % with a margin of 6) against 84.2 % for the bare minimum.
 */
export const PARSIMONY_AICC = 10;

export interface Recommendation {
  /** Every candidate that could be fitted, lowest AICc first (fewer parameters first on a tie). */
  readonly fits: readonly FitResult[];
  /** Index in `fits` of the recommended fit, or -1 when there is none. */
  readonly recommended: number;
}

/**
 * Auto-recommend (docs/PRD.md §4.8): fits every candidate and ranks by AICc. All fits share the data and the fit
 * space, so their AICc values are comparable; raw R² is not used because it always favours the most flexible
 * model. The recommendation is the simplest fit within {@link PARSIMONY_AICC} of the best.
 */
export function recommendFits(
  x: readonly number[],
  y: readonly number[],
  space: FitSpaces,
  hooks: FitHooks = {},
): Recommendation {
  const data = prepareData(x, y, space);
  if (data.u.length < MIN_POINTS) return { fits: [], recommended: -1 };
  const specs = candidateSpecs(space, data.u.length);
  const results: FitResult[] = [];
  specs.forEach((spec, i) => {
    hooks.tick?.(i / specs.length);
    const fit = fitPrepared(data, spec, { tick: () => hooks.tick?.(i / specs.length) });
    if (fit !== null) results.push(fit);
  });
  hooks.tick?.(1);
  const fits = results.sort((a, b) => a.stats.aicc - b.stats.aicc || a.k - b.k);
  return { fits, recommended: parsimonious(fits) };
}

/** Index of the fewest-parameter fit within {@link PARSIMONY_AICC} of the first (lowest AICc) one. */
export function parsimonious(fits: readonly FitResult[]): number {
  const best = fits[0]?.stats.aicc;
  if (best === undefined) return -1;
  let pick = 0;
  fits.forEach((f, i) => {
    const chosen = fits[pick];
    if (chosen !== undefined && f.stats.aicc <= best + PARSIMONY_AICC && f.k < chosen.k) pick = i;
  });
  return pick;
}
