import { describe, expect, it } from 'vitest';
import { valueToAxis } from './axis.ts';
import { expectAllClose, transformCases, type TransformCase } from './test/fixtures.ts';
import {
  applyTransform,
  pixelToValue,
  residuals,
  solveAffine,
  solveProjective,
  solveTransform,
  valueToPixel,
  type Correspondence,
} from './transform.ts';
import { DegenerateError, type Mat3 } from './types.ts';

function correspondences(c: TransformCase): Correspondence[] {
  return c.points.map((p) => ({ px: p.px, axis: valueToAxis(p.value, c.axes) }));
}

/** Compares matrices row by row: each row has its own units (u per px, v per px, 1/px), so its own scale. */
function expectMatrixClose(actual: Mat3, expected: Mat3, rel: number): void {
  for (const row of [0, 1, 2]) {
    const e = expected.slice(3 * row, 3 * row + 3);
    expectAllClose(actual.slice(3 * row, 3 * row + 3), e, { rel, scale: Math.max(...e.map(Math.abs)) });
  }
}

describe.each(transformCases)('NumPy fixture $name ($model)', (c) => {
  const points = correspondences(c);
  const m = solveTransform(c.model, points);

  it('solves the same calibration matrix', () => {
    expectMatrixClose(m, c.matrix, 1e-9);
  });

  it('reports the same residuals', () => {
    const r = residuals(m, points);
    expectAllClose(r.px, c.residuals.px, { rel: 1e-7, abs: 1e-7 });
    expect(r.rmsPx).toBeCloseTo(c.residuals.rmsPx, 7);
    r.axis.forEach((a, i) => {
      const e = c.residuals.axis[i] ?? [Number.NaN, Number.NaN];
      // Axis residuals are differences of nearly equal numbers; compare against the axis span, not themselves.
      const span = c.points.map((p) => valueToAxis(p.value, c.axes));
      const spanX = Math.max(...span.map((s) => s[0])) - Math.min(...span.map((s) => s[0]));
      const spanY = Math.max(...span.map((s) => s[1])) - Math.min(...span.map((s) => s[1]));
      expectAllClose([a[0]], [e[0]], { rel: 1e-9, scale: spanX });
      expectAllClose([a[1]], [e[1]], { rel: 1e-9, scale: spanY });
    });
  });

  it('maps query pixels to the same data values and back', () => {
    for (const q of c.queries) {
      const value = pixelToValue(m, c.axes, q.px);
      expectAllClose([value[0]], [q.value[0]], { rel: 1e-9 });
      expectAllClose([value[1]], [q.value[1]], { rel: 1e-9 });
      expectAllClose(valueToPixel(m, c.axes, value), q.px, { rel: 1e-9 });
    }
  });
});

describe('solveAffine', () => {
  // 1 unit = 100 px in x; y up, 1 unit = 2 px; origin at px (100, 900).
  const truth: Mat3 = [0.01, 0, -1, 0, -0.5, 450, 0, 0, 1];
  const grid = [
    [100, 900],
    [1100, 900],
    [100, 100],
    [1100, 100],
  ].map(([x = 0, y = 0]): Correspondence => ({ px: [x, y], axis: applyTransform(truth, [x, y]) }));

  it('recovers an exact affine transform with zero residual', () => {
    const m = solveAffine(grid);
    expectMatrixClose(m, truth, 1e-12);
    expect(m.slice(6)).toEqual([0, 0, 1]);
    expect(residuals(m, grid).rmsPx).toBeLessThan(1e-9);
  });

  it('works from the 3-point minimum', () => {
    expectMatrixClose(solveAffine(grid.slice(0, 3)), truth, 1e-12);
  });

  it('rejects too few, collinear, coincident or non-finite points', () => {
    expect(() => solveAffine(grid.slice(0, 2))).toThrow(RangeError);
    const collinear = [0, 1, 2, 3].map((i): Correspondence => ({ px: [100 * i, 50 * i], axis: [i, i] }));
    expect(() => solveAffine(collinear)).toThrow(DegenerateError);
    const sameRow = [0, 1, 2, 3].map((i): Correspondence => ({ px: [100 * i, 50], axis: [i, i] }));
    expect(() => solveAffine(sameRow)).toThrow(DegenerateError);
    expect(() => solveAffine([...grid.slice(0, 3), { px: [Number.NaN, 0], axis: [0, 0] }])).toThrow(
      RangeError,
    );
  });
});

describe('solveProjective', () => {
  const truth: Mat3 = [1.9e-3, 2.0e-4, 0.8, 1.0e-4, -1.6e-3, 3.1, 2.0e-6, 3.0e-5, 1];
  const axisPoints = [
    [1, 1],
    [6, 1],
    [1, 3],
    [6, 3],
  ];

  it('recovers an exact homography from 4 points, normalised so M[8] = 1', () => {
    // Pixel positions come from the inverse map so the correspondences are exact.
    const inverseTruthPoints = axisPoints.map(([u = 0, v = 0]): Correspondence => {
      const px = valueToPixel(truth, { x: 'linear', y: 'linear' }, [u, v]);
      return { px, axis: [u, v] };
    });
    const m = solveProjective(inverseTruthPoints);
    expectMatrixClose(m, truth, 1e-10);
    expect(m[8]).toBe(1);
    expect(residuals(m, inverseTruthPoints).rmsPx).toBeLessThan(1e-9);
  });

  it('agrees with the affine solve when the data are affine', () => {
    const affine: Mat3 = [0.004, 0.0001, -0.6, -0.0002, -0.002, 3.3, 0, 0, 1];
    const pts = [
      [150, 1650],
      [1950, 1640],
      [160, 150],
      [1960, 140],
      [1000, 900],
    ].map(([x = 0, y = 0]): Correspondence => ({ px: [x, y], axis: applyTransform(affine, [x, y]) }));
    expectMatrixClose(solveProjective(pts), solveAffine(pts), 1e-9);
  });

  it('rejects too few points and three collinear points', () => {
    const square: Correspondence[] = [
      { px: [0, 0], axis: [0, 0] },
      { px: [100, 0], axis: [1, 0] },
      { px: [0, 100], axis: [0, 1] },
    ];
    expect(() => solveProjective(square)).toThrow(RangeError);
    const threeCollinear = [...square, { px: [50, 0], axis: [0.5, 0] } satisfies Correspondence];
    expect(() => solveProjective(threeCollinear)).toThrow(DegenerateError);
  });
});

describe('residuals', () => {
  it('measures pixel distance through the inverse transform and axis error forward', () => {
    const m: Mat3 = [0.5, 0, 0, 0, 0.25, 0, 0, 0, 1];
    // The point maps to (5, 5); its stated axis value (6, 5) maps back to px (12, 20), 2 px from (10, 20).
    const r = residuals(m, [{ px: [10, 20], axis: [6, 5] }]);
    expect(r.px[0]).toBeCloseTo(2, 14);
    expect(r.axis[0]?.[0]).toBeCloseTo(-1, 14);
    expect(r.axis[0]?.[1]).toBeCloseTo(0, 14);
    expect(r.rmsPx).toBeCloseTo(2, 14);
  });
});
