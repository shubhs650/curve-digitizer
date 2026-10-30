import { describe, expect, it } from 'vitest';
import {
  axisCrossings,
  CALIBRATION_LIMITS,
  fitCalibration,
  skewDegrees,
  type AxisPick,
} from './calibration.ts';
import { crossingCases } from './test/fixtures.ts';
import type { Correspondence } from './transform.ts';
import { DegenerateError, type Mat3 } from './types.ts';

const LINEAR = { x: 'linear', y: 'linear' } as const;

describe.each(crossingCases)('axisCrossings, NumPy fixture $name', (c) => {
  it('finds where the axes cross from two picks per axis', () => {
    const { xAxisAt, yAxisAt } = axisCrossings(c.x, c.y);
    expect(xAxisAt).toBeCloseTo(c.xAxisAt, 9);
    expect(yAxisAt).toBeCloseTo(c.yAxisAt, 9);
  });

  it('gives an exact affine calibration with them', () => {
    const { xAxisAt, yAxisAt } = axisCrossings(c.x, c.y);
    const points: Correspondence[] = [
      ...c.x.map((p) => ({ px: p.px, axis: [p.axis, xAxisAt] as const })),
      ...c.y.map((p) => ({ px: p.px, axis: [yAxisAt, p.axis] as const })),
    ];
    expect(fitCalibration('affine', points, LINEAR).residuals.rmsPx).toBeLessThan(1e-9);
  });
});

describe('axisCrossings', () => {
  const x: readonly [AxisPick, AxisPick] = [
    { px: [100, 500], axis: 0 },
    { px: [900, 500], axis: 10 },
  ];

  it('refuses parallel axes and coincident picks', () => {
    const parallel: readonly [AxisPick, AxisPick] = [
      { px: [100, 300], axis: 0 },
      { px: [900, 300], axis: 5 },
    ];
    expect(() => axisCrossings(x, parallel)).toThrow(DegenerateError);
    const same: readonly [AxisPick, AxisPick] = [
      { px: [100, 100], axis: 0 },
      { px: [100, 100], axis: 5 },
    ];
    expect(() => axisCrossings(x, same)).toThrow(DegenerateError);
  });
});

describe('fitCalibration', () => {
  // vector-clean's recorded calibration: 21.2 px per x unit, 22.33 px per y unit, origin at (200, 1450).
  const clean: Correspondence[] = [
    { px: [412, 1450], axis: [10, 0] },
    { px: [2108, 1450], axis: [90, 0] },
    { px: [200, 1226.7], axis: [0, 10] },
    { px: [200, 333.3], axis: [0, 50] },
  ];

  it('reports residual and resolution of a clean chart, without warnings', () => {
    const fit = fitCalibration('affine', clean, LINEAR);
    expect(fit.residuals.rmsPx).toBeLessThan(0.05);
    expect(fit.resolution.xUnitsPerPx).toBeCloseTo(1 / 21.2, 6);
    expect(fit.resolution.yUnitsPerPx).toBeCloseTo(40 / (1226.7 - 333.3), 5);
    expect(fit.warnings).toEqual([]);
  });

  it('scales resolution on a log axis with the value at the centroid', () => {
    const points: Correspondence[] = [
      { px: [0, 1000], axis: [0, 0] },
      { px: [1000, 1000], axis: [1, 0] },
      { px: [0, 0], axis: [0, 2] },
      { px: [1000, 0], axis: [1, 2] },
    ];
    const fit = fitCalibration('affine', points, { x: 'linear', y: 'log10' });
    // Centroid at v = 1 (value 10): dv/dpx = 2/1000 decades per px, d(10^v)/dv = ln 10 · 10.
    expect(fit.resolution.yUnitsPerPx).toBeCloseTo(Math.LN10 * 10 * 0.002, 9);
    expect(fit.resolution.xUnitsPerPx).toBeCloseTo(0.001, 12);
  });

  it('warns about a wrong crossing through the residual', () => {
    // The x axis really sits at y = 2, but the X picks claim y = 0.
    const wrong = clean.map((p, i) =>
      i < 2 ? { px: [p.px[0], 1450 - 2 * 22.333] as const, axis: p.axis } : p,
    );
    const fit = fitCalibration('affine', wrong, LINEAR);
    expect(fit.residuals.rmsPx).toBeGreaterThan(CALIBRATION_LIMITS.maxResidualPx);
    expect(fit.warnings).toContainEqual({ kind: 'highResidual', residualPx: fit.residuals.rmsPx });
  });

  it('warns about points too close together', () => {
    const close = [...clean, { px: [205, 1226.7] as const, axis: [5 / 21.2, 10] as const }];
    expect(fitCalibration('affine', close, LINEAR).warnings).toContainEqual({
      kind: 'pointsTooClose',
      distancePx: 5,
    });
  });

  it('warns about skewed axes', () => {
    // The y axis leans 2° right of perpendicular.
    const lean = Math.tan((2 * Math.PI) / 180);
    const skewed = clean.map((p) => ({
      px: [p.px[0] + lean * (1450 - p.px[1]), p.px[1]] as const,
      axis: p.axis,
    }));
    const warning = fitCalibration('affine', skewed, LINEAR).warnings.find((w) => w.kind === 'skew');
    // The recorded clicks are rounded to 0.1 px, so the fitted skew is 2° to about 0.001°.
    expect(warning?.kind === 'skew' && Math.abs(warning.degrees)).toBeCloseTo(2, 2);
  });
});

describe('skewDegrees', () => {
  it('is zero for a rotated but square chart and signed for a sheared one', () => {
    const t = (5 * Math.PI) / 180;
    const rotated: Mat3 = [Math.cos(t), Math.sin(t), 0, Math.sin(t), -Math.cos(t), 0, 0, 0, 1];
    expect(skewDegrees(rotated, [10, 10])).toBeCloseTo(0, 10);
    const sheared: Mat3 = [1, 0.1, 0, 0, -1, 0, 0, 0, 1];
    expect(Math.abs(skewDegrees(sheared, [0, 0]))).toBeCloseTo((Math.atan(0.1) * 180) / Math.PI, 9);
  });
});
