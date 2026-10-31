import { describe, expect, it } from 'vitest';
import fixture from '../../fixtures/codegen-fits.json' with { type: 'json' };
import { codeFileName, generateCode, identifier, LANGUAGES, type CodeFit } from './index.ts';
import { horner, literal, wrapItems } from './text.ts';

const EXAMPLES = fixture.fits as unknown as readonly {
  readonly name: string;
  readonly datasetName: string;
  readonly fit: CodeFit;
}[];

describe('code generators', () => {
  // VBA and MATLAB are checked here only, as text (A8); C, Python, JavaScript and Excel are also run in
  // scripts/codegen/a8.test.ts. Review a changed golden file by eye before accepting it.
  it.each(LANGUAGES)('$label output matches the golden file', async ({ id }) => {
    const text = EXAMPLES.map(
      (e) => `==== ${e.name} ====\n${generateCode(e.fit, id, { datasetName: e.datasetName })}`,
    ).join('\n');
    await expect(text).toMatchFileSnapshot(`../../fixtures/golden/codegen-${id}.txt`);
  });

  it.each(LANGUAGES)('$label output is ASCII and states the range and statistics', ({ id }) => {
    for (const e of EXAMPLES) {
      const text = generateCode(e.fit, id, { datasetName: e.datasetName });
      expect(text).toMatch(/^[\x20-\x7e\n]*$/);
      const [lo, hi] = e.fit.domain;
      expect(text).toContain(`Valid for ${String(lo)} <= x <= ${String(hi)}`);
      expect(text).toContain(`R^2 = ${String(e.fit.stats.r2)}`);
      expect(text).toContain(`${String(e.fit.stats.n)} fitted points`);
    }
  });

  it('writes splines as a knot table and an interpolation snippet', () => {
    const spline = EXAMPLES.find((e) => e.fit.model === 'spline');
    if (!spline) throw new Error('fixture has no spline');
    const code = generateCode(spline.fit, 'python');
    expect(code).toContain('knots = np.array([0, 1.25, 2.5, 4, 5.5, 8, 10])');
    expect(code).toContain('slopes = np.array([');
    expect(code).toContain('np.searchsorted(knots, u');
  });

  it('reads x from the given cell in Excel and keeps 15 significant digits', () => {
    const fit: CodeFit = {
      model: 'power',
      space: { x: 'lin', y: 'lin' },
      params: { a: 1 / 3, b: -0.5 },
      domain: [1, 2],
      stats: { n: 5, r2: 1, rmse: 0, aicc: -10 },
    };
    expect(generateCode(fit, 'excel', { xRef: '$B7' })).toMatch(
      /^=0\.333333333333333\*\$B7\^\(-0\.5\)\+N\("/,
    );
  });

  it('refuses unknown models and non-finite parameters', () => {
    const base: CodeFit = {
      model: 'poly',
      space: { x: 'lin', y: 'lin' },
      params: { c: [1, Number.NaN] },
      domain: [0, 1],
      stats: { n: 3, r2: 1, rmse: 0, aicc: 0 },
    };
    expect(() => generateCode(base, 'javascript')).toThrow(RangeError);
    expect(() => generateCode({ ...base, model: 'sinc' }, 'javascript')).toThrow(RangeError);
  });
});

describe('code text helpers', () => {
  it('names the function after the dataset, safely in every language', () => {
    expect(identifier('Pump A head')).toBe('pump_a_head');
    expect(identifier('NPSHr (m)')).toBe('npshr_m');
    expect(identifier(undefined)).toBe('curve');
    expect(identifier('  ')).toBe('curve');
    expect(identifier('3 bar')).toBe('curve_3_bar');
    expect(identifier('P1')).toBe('curve_p1');
    expect(identifier('Sum')).toBe('curve_sum');
    expect(identifier('Débit — été')).toBe('debit_ete');
    expect(codeFileName('matlab', 'Pump A')).toBe('pump_a.m');
  });

  it('writes numbers exactly and nests Horner terms', () => {
    expect(literal(0.1)).toBe('0.1');
    expect(literal(1 / 3)).toBe('0.3333333333333333');
    expect(Number(literal(1 / 3))).toBe(1 / 3);
    expect(literal(1 / 3, 15)).toBe('0.333333333333333');
    expect(() => literal(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(horner(['1', '-2', '3'], 'u')).toBe('1 + u * (-2 + u * 3)');
    expect(horner(['1', '-2'], 'u')).toBe('1 + u * (-2)');
    expect(horner(['4'], 'u')).toBe('4');
    expect(wrapItems(['aa', 'bb', 'cc'], 7)).toEqual(['aa, bb,', 'cc']);
  });
});
