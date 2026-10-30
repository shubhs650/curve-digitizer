import { describe, expect, it } from 'vitest';
import { valueToAxis } from './axis.ts';
import { expectAllClose, transformCases } from './test/fixtures.ts';
import { pixelToValue, solveTransform } from './transform.ts';
import type { Mat3, Vec2 } from './types.ts';
import {
  axisJacobian,
  DEFAULT_LINE_WIDTH_PX,
  pixelSigma,
  PICK_SIGMA_PX,
  pointSigma,
  valueJacobian,
} from './uncertainty.ts';

/** Row-wise comparison: row 0 is in x units per px, row 1 in y units per px. */
function expectJacobianClose(actual: readonly number[], expected: readonly number[], rel: number): void {
  for (const row of [0, 1]) {
    const e = expected.slice(2 * row, 2 * row + 2);
    expectAllClose(actual.slice(2 * row, 2 * row + 2), e, { rel });
  }
}

describe('pixelSigma', () => {
  it('combines pick resolution and half the line width in quadrature', () => {
    expect(pixelSigma(0)).toBe(PICK_SIGMA_PX);
    expect(pixelSigma(DEFAULT_LINE_WIDTH_PX)).toBeCloseTo(Math.sqrt(1.25), 15);
    expect(pixelSigma()).toBe(pixelSigma(2));
    expect(pixelSigma(3)).toBeCloseTo(Math.hypot(0.5, 1.5), 15);
  });

  it('rejects negative or non-finite line widths', () => {
    expect(() => pixelSigma(-1)).toThrow(RangeError);
    expect(() => pixelSigma(Number.NaN)).toThrow(RangeError);
    expect(() => pixelSigma(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe.each(transformCases)('NumPy fixture $name ($model)', (c) => {
  const m = solveTransform(
    c.model,
    c.points.map((p) => ({ px: p.px, axis: valueToAxis(p.value, c.axes) })),
  );

  it.each(c.queries)('Jacobians and sigma at px $px', (q) => {
    expectJacobianClose(axisJacobian(m, q.px), q.axisJacobian, 1e-8);
    expectJacobianClose(valueJacobian(m, c.axes, q.px), q.valueJacobian, 1e-8);
    expectAllClose([pointSigma(m, c.axes, q.px, q.lineWidthPx)[0]], [q.sigma[0]], { rel: 1e-8 });
    expectAllClose([pointSigma(m, c.axes, q.px, q.lineWidthPx)[1]], [q.sigma[1]], { rel: 1e-8 });
  });

  it.each(c.queries)('value Jacobian at px $px matches central differences', (q) => {
    const h = 1e-3;
    const at = (dx: number, dy: number): Vec2 => pixelToValue(m, c.axes, [q.px[0] + dx, q.px[1] + dy]);
    const [xp, yp] = [at(h, 0), at(0, h)];
    const [xm, ym] = [at(-h, 0), at(0, -h)];
    const numeric = [
      (xp[0] - xm[0]) / (2 * h),
      (yp[0] - ym[0]) / (2 * h),
      (xp[1] - xm[1]) / (2 * h),
      (yp[1] - ym[1]) / (2 * h),
    ];
    expectJacobianClose(valueJacobian(m, c.axes, q.px), numeric, 1e-6);
  });
});

describe('pointSigma', () => {
  const linear: Mat3 = [0.01, 0, -1, 0, -0.5, 450, 0, 0, 1];

  it('is σpx × units-per-px on an untilted linear chart', () => {
    const s = pixelSigma(3);
    const [sx, sy] = pointSigma(linear, { x: 'linear', y: 'linear' }, [400, 300], 3);
    expect(sx).toBeCloseTo(s * 0.01, 15);
    expect(sy).toBeCloseTo(s * 0.5, 15);
  });

  it('grows with the value on a log10 axis, a constant fraction per decade', () => {
    // y = 10^(v), one decade per 100 px.
    const m: Mat3 = [1, 0, 0, 0, -0.01, 5, 0, 0, 1];
    const axes = { x: 'linear', y: 'log10' } as const;
    const low = pointSigma(m, axes, [0, 400]);
    const high = pointSigma(m, axes, [0, 100]);
    const valueLow = pixelToValue(m, axes, [0, 400])[1];
    const valueHigh = pixelToValue(m, axes, [0, 100])[1];
    expect(high[1]).toBeGreaterThan(low[1]);
    expect(high[1] / valueHigh).toBeCloseTo(low[1] / valueLow, 12);
    expect(low[1] / valueLow).toBeCloseTo(Math.LN10 * 0.01 * pixelSigma(), 12);
  });

  it('is positive and at least 0.5 px-equivalent for every fixture query (A9)', () => {
    for (const c of transformCases) {
      const m = solveTransform(
        c.model,
        c.points.map((p) => ({ px: p.px, axis: valueToAxis(p.value, c.axes) })),
      );
      for (const q of c.queries) {
        const sigma = pointSigma(m, c.axes, q.px, q.lineWidthPx);
        const halfPx = pointSigma(m, c.axes, q.px, 0);
        const [jx0, jx1, jy0, jy1] = valueJacobian(m, c.axes, q.px);
        expect(sigma[0]).toBeGreaterThan(0);
        expect(sigma[1]).toBeGreaterThan(0);
        expect(sigma[0]).toBeGreaterThanOrEqual(halfPx[0]);
        expect(sigma[1]).toBeGreaterThanOrEqual(halfPx[1]);
        expect(halfPx[0]).toBeCloseTo(PICK_SIGMA_PX * Math.hypot(jx0, jx1), 12);
        expect(halfPx[1]).toBeCloseTo(PICK_SIGMA_PX * Math.hypot(jy0, jy1), 12);
      }
    }
  });
});
