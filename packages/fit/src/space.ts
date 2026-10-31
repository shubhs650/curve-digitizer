import type { FitSpace } from '@cd/core';

/** Data value → fit-space coordinate: itself on a linear axis, log10 on a log axis (NaN when not positive). */
export function toSpace(value: number, space: FitSpace): number {
  if (space === 'lin') return value;
  return value > 0 ? Math.log10(value) : Number.NaN;
}

/** Fit-space coordinate → data value. */
export function fromSpace(value: number, space: FitSpace): number {
  return space === 'lin' ? value : 10 ** value;
}

/** d(toSpace)/d(value): 1, or 1/(value·ln 10) on a log axis. */
export function toSpaceDerivative(value: number, space: FitSpace): number {
  return space === 'lin' ? 1 : 1 / (value * Math.LN10);
}

/** The fit space of a calibration axis type: log axes are fitted in log10 (docs/ARCHITECTURE.md §8.5). */
export function spaceOfAxis(type: 'linear' | 'log10'): FitSpace {
  return type === 'log10' ? 'log' : 'lin';
}
