import { MODELS } from './models/index.ts';
import { isModelId } from './models/index.ts';
import type { FitCurve } from './types.ts';

export interface FitValue {
  readonly y: number;
  /** x lies outside the fit's domain (the X range of the points it was fitted to). */
  readonly extrapolated: boolean;
}

/** y of a stored fit at data x, flagged when x is outside the fit's domain. NaN for an unknown model. */
export function evaluateFit(fit: FitCurve, x: number): FitValue {
  const y = isModelId(fit.model) ? MODELS[fit.model].evaluate(fit.params, x, fit.space) : Number.NaN;
  return { y, extrapolated: !(x >= fit.domain[0] && x <= fit.domain[1]) };
}

/**
 * `count` points (x, y) of the fit across [from, to] (default its domain), evenly spaced in fit space so a
 * curve on a log axis is drawn as smoothly as on a linear one. Points where the model is undefined are left out.
 */
export function sampleFit(
  fit: FitCurve,
  count: number,
  [from, to]: readonly [number, number] = fit.domain,
): (readonly [number, number])[] {
  const log = fit.space.x === 'log' && from > 0 && to > 0;
  const a = log ? Math.log10(from) : from;
  const b = log ? Math.log10(to) : to;
  const out: (readonly [number, number])[] = [];
  for (let i = 0; i < count; i++) {
    const s = a + ((b - a) * i) / Math.max(1, count - 1);
    const x = log ? 10 ** s : s;
    const { y } = evaluateFit(fit, x);
    if (Number.isFinite(y)) out.push([x, y]);
  }
  return out;
}
