import type { Fit, FitSpace } from '@cd/core';

/** Registry ids, as stored in `Fit.model`. */
export type ModelId = 'poly' | 'power' | 'exp' | 'log' | 'rational' | 'spline' | 'pchip' | 'piecewise';

export interface FitSpaces {
  readonly x: FitSpace;
  readonly y: FitSpace;
}

/** `Fit.params`: model-specific numbers and number arrays (docs/PROJECT_SCHEMA.md). */
export type FitParams = Fit['params'];

/** What to fit. Spline knots and piecewise breakpoints default to `'auto'`. */
export type ModelSpec =
  | { readonly model: 'poly'; readonly degree: number }
  | { readonly model: 'power' }
  | { readonly model: 'exp' }
  | { readonly model: 'log' }
  | { readonly model: 'rational'; readonly num: number; readonly den: number }
  | { readonly model: 'spline' | 'pchip'; readonly knots?: number | 'auto' }
  | { readonly model: 'piecewise'; readonly breakpoints?: readonly number[] | 'auto' };

/**
 * Data prepared for fitting: the points' data values and their fit-space coordinates u = Tx(x), v = Ty(y)
 * (log10 on a log axis), sorted by u.
 */
export interface FitData {
  readonly space: FitSpaces;
  readonly x: readonly number[];
  readonly y: readonly number[];
  readonly u: readonly number[];
  readonly v: readonly number[];
}

/** A model's fit before statistics: its parameters and how many of them were estimated from the data. */
export interface ModelFit {
  readonly params: FitParams;
  readonly k: number;
}

/** Why a fit deserves a second look. Extrapolation is per query (see `evaluateFit`). */
export type FitWarning = 'oscillation';

/** A computed fit: everything `Fit` stores except its id, dataset and recommendation flag, plus k and warnings. */
export interface FitResult extends Omit<Fit, 'id' | 'datasetId' | 'recommended'> {
  readonly model: ModelId;
  readonly k: number;
  readonly warnings: readonly FitWarning[];
}

/** The parts of a `Fit` needed to evaluate it. */
export type FitCurve = Pick<Fit, 'model' | 'params' | 'space' | 'domain'>;

export interface FitHooks {
  /** Called often with the fraction done; may throw to cancel. */
  readonly tick?: (fraction: number) => void;
}
