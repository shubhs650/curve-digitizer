import { describe, expect, it } from 'vitest';
import { niceStep, parseValueList, stepValues } from './xValues';

describe('X values', () => {
  it('steps from From to To inclusive, without float noise, either way', () => {
    expect(stepValues(0, 1, 0.1)).toEqual({
      ok: true,
      xs: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1],
    });
    expect(stepValues(10, 0, 5)).toEqual({ ok: true, xs: [10, 5, 0] });
    expect(stepValues(0, 9, 4)).toEqual({ ok: true, xs: [0, 4, 8] });
    expect(stepValues(0, 1, 0)).toEqual({ ok: false, message: 'Step must be more than 0' });
    expect(stepValues(0, 1e6, 1).ok).toBe(false);
    expect(stepValues(Number.NaN, 1, 1).ok).toBe(false);
  });

  it('parses a typed list', () => {
    expect(parseValueList('1, 2.5;3\n 4e1')).toEqual({ ok: true, xs: [1, 2.5, 3, 40] });
    expect(parseValueList('  ')).toEqual({ ok: false, message: 'Enter at least one X value' });
    expect(parseValueList('1, two')).toEqual({ ok: false, message: '"two" is not a number' });
  });

  it('picks round steps', () => {
    expect(niceStep(0, 100)).toBe(5);
    expect(niceStep(0, 30)).toBe(2);
    expect(niceStep(0, 0.7)).toBeCloseTo(0.05);
    expect(niceStep(3, 3)).toBe(1);
  });
});
