import type { FitParams } from './types.ts';

/** A scalar parameter; NaN when missing or an array, so a malformed fit evaluates to NaN rather than throwing. */
export function scalar(params: FitParams, key: string): number {
  const v = params[key];
  return typeof v === 'number' ? v : Number.NaN;
}

/** An array parameter; empty when missing or a scalar. */
export function vector(params: FitParams, key: string): readonly number[] {
  const v = params[key];
  return Array.isArray(v) ? (v as readonly number[]) : [];
}
