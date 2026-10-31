import { describe, expect, it } from 'vitest';
import recommendJson from '../fixtures/recommend.json';
import { candidateSpecs, PARSIMONY_AICC, parsimonious, recommendFits } from './recommend.ts';
import { spaceOfAxis } from './space.ts';

// A7 (docs/ACCEPTANCE_TARGETS.md): the recommendation picks the ground-truth family on every synthetic fixture.
// The datasets are drawn by scripts/gen-fixtures.py (NumPy) with Gaussian noise of 0.3 % and 1 % of the y range.

interface Case {
  readonly name: string;
  readonly family: string;
  readonly degree: number | null;
  readonly axes: { readonly x: 'linear' | 'log10'; readonly y: 'linear' | 'log10' };
  readonly x: readonly number[];
  readonly y: readonly number[];
}

const cases = recommendJson.cases as readonly Case[];

describe('A7: auto-recommend picks the ground-truth family', () => {
  it('covers power, exp, poly-3 and piecewise fixtures', () => {
    expect(new Set(cases.map((c) => c.family))).toEqual(new Set(['power', 'exp', 'poly', 'piecewise']));
  });

  it.each(cases)('$name', ({ family, degree, axes, x, y }) => {
    const { fits: ranked, recommended } = recommendFits(x, y, {
      x: spaceOfAxis(axes.x),
      y: spaceOfAxis(axes.y),
    });
    const best = ranked[recommended];
    expect(best?.model).toBe(family);
    if (degree !== null) expect(best?.params.c).toHaveLength(degree + 1);
    expect(best?.warnings).toEqual([]);
    expect(best?.stats.aicc).toBeLessThanOrEqual((ranked[0]?.stats.aicc ?? NaN) + PARSIMONY_AICC);
    // AICc is ascending, so the top three the panel shows are the three best.
    ranked.slice(1).forEach((fit, i) => {
      expect(fit.stats.aicc).toBeGreaterThanOrEqual(ranked[i]?.stats.aicc ?? -Infinity);
    });
  });
});

describe('parsimonious', () => {
  const fit = (aicc: number, k: number) =>
    ({ stats: { aicc, n: 30, r2: 1, rmse: 0 }, k }) as unknown as Parameters<typeof parsimonious>[0][number];

  it('keeps the fewest parameters within the AICc margin, lowest AICc among equals', () => {
    expect(parsimonious([fit(-50, 6), fit(-47, 3), fit(-46, 2), fit(-45.5, 2), fit(-39.9, 1)])).toBe(2);
    expect(parsimonious([fit(-50, 6), fit(-39.9, 2)])).toBe(0);
    expect(parsimonious([])).toBe(-1);
  });
});

describe('candidateSpecs', () => {
  it('offers every family, polynomials up to degree 9 when there are enough points', () => {
    const specs = candidateSpecs({ x: 'lin', y: 'lin' }, 40);
    expect(new Set(specs.map((s) => s.model))).toEqual(
      new Set(['poly', 'power', 'exp', 'log', 'rational', 'spline', 'pchip', 'piecewise']),
    );
    expect(specs.filter((s) => s.model === 'poly')).toHaveLength(9);
  });

  it('limits the degree to what the points support', () => {
    const degrees = candidateSpecs({ x: 'lin', y: 'lin' }, 6).flatMap((s) =>
      s.model === 'poly' ? [s.degree] : [],
    );
    expect(degrees).toEqual([1, 2, 3]);
  });

  it.each([
    ['log', 'log'],
    ['lin', 'log'],
    ['log', 'lin'],
  ] as const)('drops the straight line on %s-%s axes, where a named law is that line', (sx, sy) => {
    const specs = candidateSpecs({ x: sx, y: sy }, 40);
    expect(specs).not.toContainEqual({ model: 'poly', degree: 1 });
    expect(specs).toContainEqual({ model: 'poly', degree: 2 });
  });

  it('returns nothing for fewer than three points', () => {
    expect(recommendFits([1, 2], [3, 4], { x: 'lin', y: 'lin' })).toEqual({ fits: [], recommended: -1 });
  });

  it('reports progress and can be cancelled from the tick', () => {
    const x = Array.from({ length: 30 }, (_, i) => i + 1);
    const y = x.map((v) => 2 * v + 1);
    const fractions: number[] = [];
    recommendFits(x, y, { x: 'lin', y: 'lin' }, { tick: (f) => fractions.push(f) });
    expect(fractions.at(-1)).toBe(1);
    expect(fractions.every((f, i) => i === 0 || f >= (fractions[i - 1] ?? 0))).toBe(true);
    expect(() =>
      recommendFits(
        x,
        y,
        { x: 'lin', y: 'lin' },
        {
          tick: () => {
            throw new Error('cancelled');
          },
        },
      ),
    ).toThrow('cancelled');
  });
});
