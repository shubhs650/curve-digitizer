import { describe, expect, it } from 'vitest';
import { levenbergMarquardt } from './lm.ts';
import { polyfit, polyval } from './poly.ts';
import {
  evalCubicSpline,
  knotInterval,
  linearSpline,
  lsqSplineValues,
  naturalSpline,
  naturalSplineSecondDerivatives,
  pchip,
  pchipSlopes,
} from './spline.ts';
import { aicc } from './stats.ts';
import { expectAllClose, fitsFixture } from './test/fixtures.ts';
import { DegenerateError } from './types.ts';

describe('polyfit / polyval', () => {
  it.each(fitsFixture.poly)(
    'matches numpy.polyfit ($name)',
    ({ x, y, degree, coefficients, queries, values }) => {
      const c = polyfit(x, y, degree);
      expect(c).toHaveLength(degree + 1);
      // The degree-9 Vandermonde system is too ill-conditioned for 1e-9 on single coefficients; the fitted curve is
      // what the code generators reproduce, so compare values everywhere and coefficients where conditioning allows.
      if (degree <= 5) expectAllClose(c, coefficients, { rel: 1e-8 });
      expectAllClose(
        queries.map((q) => polyval(c, q)),
        values,
        { rel: 1e-9 },
      );
    },
  );

  it('evaluates by Horner and rejects too few points', () => {
    expect(polyval([1, -2, 3], 2)).toBe(1 - 4 + 12);
    expect(polyval([], 5)).toBe(0);
    expect(() => polyfit([1, 1, 1], [1, 2, 3], 1)).toThrow(DegenerateError);
    expect(() => polyfit([1, 2], [1, 2], 1.5)).toThrow(RangeError);
  });
});

describe('splines', () => {
  it.each(fitsFixture.splines)('natural cubic spline matches scipy CubicSpline ($name)', (c) => {
    const m = naturalSplineSecondDerivatives(c.knots, c.values);
    expectAllClose(m, c.naturalSecond, { rel: 1e-12, abs: 1e-12 });
    expectAllClose(
      c.queries.map((u) => naturalSpline(c.knots, c.values, u)),
      c.natural,
      { rel: 1e-12 },
    );
    expectAllClose(
      c.queries.map((u) => evalCubicSpline(c.knots, c.values, m, u)),
      c.natural,
      { rel: 1e-12 },
    );
  });

  it.each(fitsFixture.splines)('PCHIP matches scipy PchipInterpolator ($name)', (c) => {
    expectAllClose(pchipSlopes(c.knots, c.values), c.pchipSlopes, { rel: 1e-12, abs: 1e-14 });
    expectAllClose(
      c.queries.map((u) => pchip(c.knots, c.values, u)),
      c.pchip,
      { rel: 1e-12 },
    );
  });

  it('interpolates linearly and extends the end segments', () => {
    const t = [0, 1, 3];
    const v = [0, 2, 0];
    expect(linearSpline(t, v, 0.5)).toBe(1);
    expect(linearSpline(t, v, 2)).toBe(1);
    expect(linearSpline(t, v, -1)).toBe(-2);
    expect(linearSpline(t, v, 5)).toBe(-2);
    expect(knotInterval(t, -3)).toBe(0);
    expect(knotInterval(t, 1)).toBe(1);
    expect(knotInterval(t, 9)).toBe(1);
  });

  it('least-squares knot values match the NumPy reference for natural and linear splines', () => {
    const { x, y, knots, naturalValues, linearValues } = fitsFixture.lsqSpline;
    expectAllClose(lsqSplineValues(knots, x, y, 'natural'), naturalValues, { rel: 1e-10 });
    expectAllClose(lsqSplineValues(knots, x, y, 'linear'), linearValues, { rel: 1e-10 });
  });

  it('rejects unsorted or too few knots', () => {
    expect(() => naturalSplineSecondDerivatives([0], [1])).toThrow(RangeError);
    expect(() => pchipSlopes([0, 2, 1], [1, 2, 3])).toThrow(RangeError);
    expect(() => pchipSlopes([0, 1], [1, 2, 3])).toThrow(RangeError);
  });
});

describe('levenbergMarquardt', () => {
  const models: Record<string, (p: readonly number[], x: number) => { f: number; grad: number[] }> = {
    power: ([a = 0, b = 0], x) => ({ f: a * x ** b, grad: [x ** b, a * x ** b * Math.log(x)] }),
    exp: ([a = 0, b = 0], x) => ({
      f: a * Math.exp(b * x),
      grad: [Math.exp(b * x), a * x * Math.exp(b * x)],
    }),
    rational11: ([p0 = 0, p1 = 0, q1 = 0], x) => {
      const q = 1 + q1 * x;
      return { f: (p0 + p1 * x) / q, grad: [1 / q, x / q, (-(p0 + p1 * x) * x) / (q * q)] };
    },
  };

  it.each(fitsFixture.curveFit)(
    'matches scipy.optimize.curve_fit ($model)',
    ({ model, x, y, p0, params }) => {
      const f = models[model];
      if (f === undefined) throw new Error(`no model ${model}`);
      const result = levenbergMarquardt(
        {
          residuals: (p) => x.map((xi, i) => f(p, xi).f - (y[i] ?? 0)),
          jacobian: (p) => x.map((xi) => f(p, xi).grad),
        },
        p0,
      );
      expect(result.converged).toBe(true);
      params.forEach((pi, i) => {
        expectAllClose([result.params[i] ?? Number.NaN], [pi], { rel: 1e-7 });
      });
    },
  );

  it('refuses a start where the residuals are not finite', () => {
    expect(() => levenbergMarquardt({ residuals: () => [Number.NaN], jacobian: () => [[1]] }, [0])).toThrow(
      RangeError,
    );
  });
});

describe('aicc', () => {
  it.each(fitsFixture.aicc)('matches the reference formula (n=$n, k=$k)', ({ rss, n, k, aicc: expected }) => {
    expectAllClose([aicc(rss, n, k)], [expected], { rel: 1e-14 });
  });

  it('is undefined when n ≤ k + 1', () => {
    expect(() => aicc(1, 4, 3)).toThrow(RangeError);
  });
});
