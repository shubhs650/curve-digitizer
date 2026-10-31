import { fitModel, type FitSpaces, type ModelSpec, type Recommendation, recommendFits } from '@cd/fit';
import type { Task } from '../api.ts';

export interface FitDatasetInput {
  /** Data values of the points to fit (excluded points already left out). */
  readonly x: readonly number[];
  readonly y: readonly number[];
  readonly space: FitSpaces;
  /** One model to fit; without it every candidate is fitted and ranked (auto-recommend). */
  readonly spec?: ModelSpec;
}

/**
 * Fits in the compute worker (task 3.2): auto-recommend, or one chosen model. The fitting loops call `tick`
 * between candidates and inside the breakpoint and knot searches, which reports progress and honours cancel.
 */
export const fitDataset: Task<FitDatasetInput, Recommendation> = {
  run({ x, y, space, spec }, ctx) {
    const tick = (fraction: number): void => {
      ctx.throwIfCancelled();
      ctx.progress(fraction, 'Fitting');
    };
    if (spec === undefined) return recommendFits(x, y, space, { tick });
    const fit = fitModel(x, y, space, spec, { tick });
    return fit === null ? { fits: [], recommended: -1 } : { fits: [fit], recommended: 0 };
  },
};
