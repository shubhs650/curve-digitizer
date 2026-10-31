import { describe, expect, it } from 'vitest';
import { evaluateFit, sampleFit } from './evaluate.ts';
import { fitModel, prepareData } from './fit.ts';
import { isModelId, MODELS } from './models/index.ts';
import { linearSplineLsq } from './models/shapes.ts';
import { oscillates } from './warnings.ts';
import type { FitSpaces, ModelSpec } from './types.ts';

const LIN: FitSpaces = { x: 'lin', y: 'lin' };
const LOGLOG: FitSpaces = { x: 'log', y: 'log' };
const linspace = (a: number, b: number, n: number): number[] =>
  Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));

function fitted(spec: ModelSpec, x: readonly number[], f: (x: number) => number, space = LIN) {
  const fit = fitModel(x, x.map(f), space, spec);
  if (fit === null) throw new Error(`${spec.model} did not fit`);
  return fit;
}

describe('models recover exact data', () => {
  const x = linspace(1, 20, 25);

  it.each([
    [
      { model: 'poly', degree: 3 } as const,
      (t: number) => 2 - 0.5 * t + 0.1 * t ** 2 - 0.003 * t ** 3,
      { c: [2, -0.5, 0.1, -0.003] },
    ],
    [{ model: 'power' } as const, (t: number) => 7 * t ** -1.3, { a: 7, b: -1.3 }],
    [{ model: 'exp' } as const, (t: number) => 0.4 * Math.exp(0.15 * t), { a: 0.4, b: 0.15 }],
    [{ model: 'exp' } as const, (t: number) => -3 * Math.exp(-0.2 * t), { a: -3, b: -0.2 }],
    [{ model: 'log' } as const, (t: number) => 1.5 - 2 * Math.log(t), { a: 1.5, b: -2 }],
    [
      { model: 'rational', num: 1, den: 1 } as const,
      (t: number) => (3 + 2 * t) / (1 + 0.25 * t),
      { p: [3, 2], q: [0.25] },
    ],
  ])('%o', (spec, f, params) => {
    const fit = fitted(spec, x, f);
    for (const [key, expected] of Object.entries(params) as [string, number | readonly number[]][]) {
      const actual = fit.params[key];
      if (typeof expected !== 'number') {
        expected.forEach((e, i) => {
          expect((actual as readonly number[])[i]).toBeCloseTo(e, 9);
        });
      } else expect(actual).toBeCloseTo(expected, 9);
    }
    expect(fit.stats.r2).toBeCloseTo(1, 12);
    expect(fit.stats.rmse).toBeLessThan(1e-9);
    expect(fit.domain).toEqual([1, 20]);
    expect(fit.stats.n).toBe(25);
  });

  it('a power law on log–log axes is fitted as the straight line in log space', () => {
    const xs = linspace(0, 5, 20).map((e) => 10 ** e);
    const fit = fitted({ model: 'power' }, xs, (t) => 3000 * t ** -0.3, LOGLOG);
    expect(fit.params.a).toBeCloseTo(3000, 6);
    expect(fit.params.b).toBeCloseTo(-0.3, 12);
    expect(fit.space).toEqual(LOGLOG);
  });

  it('polynomials and splines on log axes are shapes on the log paper', () => {
    const xs = linspace(0, 4, 20).map((e) => 10 ** e);
    const fit = fitted(
      { model: 'poly', degree: 2 },
      xs,
      (t) => 10 ** (1 + 0.5 * Math.log10(t) - 0.1 * Math.log10(t) ** 2),
      LOGLOG,
    );
    (fit.params.c as readonly number[]).forEach((c, i) => {
      expect(c).toBeCloseTo([1, 0.5, -0.1][i] ?? NaN, 9);
    });
    expect(evaluateFit(fit, 100).y).toBeCloseTo(10 ** (1 + 1 - 0.4), 9);
  });

  it('splines and PCHIP reproduce a curve that is in their family', () => {
    const xs = linspace(0, 10, 40);
    const line = (t: number) => 3 - 0.7 * t;
    for (const model of ['spline', 'pchip'] as const) {
      const fit = fitted({ model, knots: 5 }, xs, line);
      expect(fit.params.knots).toHaveLength(5);
      expect(fit.k).toBe(5);
      expect(fit.stats.rmse).toBeLessThan(1e-9);
    }
    const auto = fitted({ model: 'spline' }, xs, (t) => Math.sin(t / 2));
    expect(auto.k).toBe((auto.params.knots as readonly number[]).length + 1);
    expect(auto.stats.rmse).toBeLessThan(2e-3);
  });

  it('piecewise linear uses given breakpoints or finds them', () => {
    const xs = linspace(0, 10, 41);
    const kink = (t: number) => (t < 3.3 ? 1 + 2 * t : 7.6 - 0.5 * (t - 3.3));
    const given = fitted({ model: 'piecewise', breakpoints: [3.3] }, xs, kink);
    expect(given.params.knots).toEqual([0, 3.3, 10]);
    expect(given.k).toBe(3);
    expect(given.stats.rmse).toBeLessThan(1e-9);
    const auto = fitted({ model: 'piecewise' }, xs, kink);
    expect((auto.params.knots as readonly number[])[1]).toBeCloseTo(3.3, 6);
    expect(auto.k).toBe(3 + 2);
    expect(fitModel(xs, xs.map(kink), LIN, { model: 'piecewise', breakpoints: [20] })).toBeNull();
  });
});

describe('models that do not apply', () => {
  it('power and log need x > 0; exp and power need y of one sign', () => {
    const x = linspace(-2, 5, 12);
    expect(
      fitModel(
        x,
        x.map((t) => t + 10),
        LIN,
        { model: 'power' },
      ),
    ).toBeNull();
    expect(
      fitModel(
        x,
        x.map((t) => t + 10),
        LIN,
        { model: 'log' },
      ),
    ).toBeNull();
    expect(
      fitModel(
        x,
        x.map((t) => Math.sin(t)),
        LIN,
        { model: 'exp' },
      ),
    ).toBeNull();
  });

  it('rejects a rational with a pole inside the data range', () => {
    const x = linspace(-1, 1, 30);
    const fit = fitModel(
      x,
      x.map((t) => 1 / (t + 0.05)),
      LIN,
      { model: 'rational', num: 0, den: 1 },
    );
    expect(fit).toBeNull();
  });

  it('needs more points than parameters + 1', () => {
    expect(fitModel([1, 2, 3, 4], [1, 4, 9, 16], LIN, { model: 'poly', degree: 3 })).toBeNull();
    expect(fitModel([1, 2], [1, 4], LIN, { model: 'poly', degree: 1 })).toBeNull();
    expect(fitModel([1, 2, 3, 4, 5], [1, 4, 9, 16, 25], LIN, { model: 'poly', degree: 10 })).toBeNull();
  });
});

describe('prepareData', () => {
  it('sorts by fit-space x and drops points with no place on a log axis', () => {
    const d = prepareData([10, 1, 100, -5], [3, 2, 1, 4], { x: 'log', y: 'lin' });
    expect(d.x).toEqual([1, 10, 100]);
    expect(d.u).toEqual([0, 1, 2]);
    expect(d.v).toEqual([2, 3, 1]);
  });
});

describe('evaluateFit / sampleFit', () => {
  const fit = fitted({ model: 'power' }, linspace(1, 10, 10), (t) => 2 * t ** 2);

  it('flags queries outside the domain', () => {
    expect(evaluateFit(fit, 5)).toEqual({ y: expect.closeTo(50, 9) as number, extrapolated: false });
    expect(evaluateFit(fit, 10).extrapolated).toBe(false);
    expect(evaluateFit(fit, 12).extrapolated).toBe(true);
    expect(evaluateFit(fit, 0.5).extrapolated).toBe(true);
    expect(evaluateFit(fit, -1).y).toBeNaN();
    expect(evaluateFit({ ...fit, model: 'nope' }, 2).y).toBeNaN();
  });

  it('samples evenly in fit space and skips undefined points', () => {
    const lin = sampleFit(fit, 10);
    expect(lin).toHaveLength(10);
    expect(lin[0]?.[0]).toBe(1);
    expect(lin[9]?.[0]).toBe(10);
    const log = sampleFit({ ...fit, space: { x: 'log', y: 'lin' }, domain: [1, 1000] }, 4);
    log.forEach(([x], i) => {
      expect(x).toBeCloseTo(10 ** i, 9);
    });
    expect(sampleFit(fit, 4, [-1, 1])).toHaveLength(2);
  });
});

describe('oscillation warning', () => {
  it('flags a high-degree polynomial swinging through a gap and passes a smooth one', () => {
    const x = [...linspace(0, 3, 12), ...linspace(7, 10, 12)];
    const y = x.map((t) => Math.sin(t) + 0.02 * Math.cos(37 * t));
    const wild = fitted({ model: 'poly', degree: 9 }, x, (t) => y[x.indexOf(t)] ?? 0);
    expect(wild.warnings).toEqual(['oscillation']);
    const smooth = fitted({ model: 'poly', degree: 3 }, linspace(0, 3, 20), (t) => t ** 3 - t);
    expect(smooth.warnings).toEqual([]);
    expect(
      oscillates(
        smooth,
        prepareData(
          linspace(0, 3, 20),
          linspace(0, 3, 20).map((t) => t ** 3 - t),
          LIN,
        ),
      ),
    ).toBe(false);
  });
});

describe('registry', () => {
  it('describes every model and knows its ids', () => {
    expect(Object.keys(MODELS).sort()).toEqual([
      'exp',
      'log',
      'pchip',
      'piecewise',
      'poly',
      'power',
      'rational',
      'spline',
    ]);
    expect(isModelId('poly')).toBe(true);
    expect(isModelId('toString')).toBe(false);
    expect(MODELS.poly.describe({ c: [1, 2, 3, 4] })).toBe('Polynomial, degree 3');
    expect(MODELS.rational.describe({ p: [1, 2, 3], q: [1] })).toBe('Rational, degree 2/1');
    expect(MODELS.spline.describe({ knots: [1, 2, 3], values: [0, 0, 0] })).toBe('Cubic spline, 3 knots');
    expect(MODELS.piecewise.describe({ knots: [1, 2, 3], values: [0, 0, 0] })).toBe(
      'Piecewise linear, 2 segments',
    );
    expect(MODELS.power.describe({ a: 2, b: -0.5 })).toBe('Power law y = 2.000·x^-0.5000');
  });

  it('linearSplineLsq agrees with the dense least-squares solution', () => {
    const u = linspace(0, 9, 30);
    const v = u.map((t) => Math.cos(t));
    const knots = [0, 2.5, 5, 9];
    const fit = linearSplineLsq(knots, u, v);
    const dense = fitModel(u, v, LIN, { model: 'piecewise', breakpoints: [2.5, 5] });
    fit?.values.forEach((value, i) => {
      expect(value).toBeCloseTo((dense?.params.values as readonly number[])[i] ?? NaN, 10);
    });
    expect(linearSplineLsq([0, 1, 2, 9], [0, 0.5, 8], [1, 2, 3])).toBeNull();
  });
});
