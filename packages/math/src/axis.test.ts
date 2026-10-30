import { describe, expect, it } from 'vitest';
import { axisToValue, fromAxis, fromAxisDerivative, toAxis, valueToAxis } from './axis.ts';

describe('axis mapping', () => {
  it('is the identity on linear axes', () => {
    expect(toAxis(-12.5, 'linear')).toBe(-12.5);
    expect(fromAxis(-12.5, 'linear')).toBe(-12.5);
    expect(fromAxisDerivative(7, 'linear')).toBe(1);
  });

  it('maps log10 axes to decades and back', () => {
    expect(toAxis(1000, 'log10')).toBe(3);
    expect(toAxis(1e-6, 'log10')).toBe(-6);
    expect(fromAxis(2, 'log10')).toBe(100);
    for (const v of [3.7e-9, 0.5, 1, 42, 6.02e23]) {
      expect(fromAxis(toAxis(v, 'log10'), 'log10') / v).toBeCloseTo(1, 14);
    }
  });

  it('rejects values that have no position on a log10 axis', () => {
    for (const v of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => toAxis(v, 'log10')).toThrow(RangeError);
    }
  });

  it('gives dv/da = ln(10)·10^a on log10 axes, matching a central difference', () => {
    for (const a of [-3, 0, 0.3, 2.5]) {
      const h = 1e-6;
      const numeric = (fromAxis(a + h, 'log10') - fromAxis(a - h, 'log10')) / (2 * h);
      expect(fromAxisDerivative(a, 'log10') / numeric).toBeCloseTo(1, 8);
    }
  });

  it('maps pairs per axis', () => {
    const axes = { x: 'log10', y: 'linear' } as const;
    expect(valueToAxis([100, 5], axes)).toEqual([2, 5]);
    expect(axisToValue([2, 5], axes)).toEqual([100, 5]);
  });
});
