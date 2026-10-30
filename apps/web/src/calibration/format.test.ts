import { describe, expect, it } from 'vitest';
import { EMPTY_DRAFT, evaluateDraft } from './draft';
import { calibratedReadout, formatValue } from './format';

describe('formatValue', () => {
  it('shows one decimal more than a pixel resolves', () => {
    expect(formatValue(12.345678, 'linear', 0.05)).toBe('12.346');
    expect(formatValue(12.345678, 'linear', 2)).toBe('12.3');
    expect(formatValue(12.345678, 'linear', 20)).toBe('12');
    expect(formatValue(-3, 'linear', 0.5)).toBe('-3.00');
  });

  it('uses significant digits on log axes and exponents at the extremes', () => {
    expect(formatValue(1234.5678, 'log10', 0.1)).toBe('1235');
    expect(formatValue(0.012345, 'log10', 0.1)).toBe('0.01235');
    expect(formatValue(2.5e9, 'linear', 1)).toBe('2.500e+9');
    expect(formatValue(3e-6, 'linear', 1e-7)).toBe('3.000e-6');
    expect(formatValue(Number.NaN, 'linear', 1)).toBe('—');
  });
});

describe('calibratedReadout', () => {
  it('reads the value under a pixel with the axis labels', () => {
    const evaluation = evaluateDraft({
      ...EMPTY_DRAFT,
      picks: [
        [100, 500],
        [900, 500],
        [50, 400],
        [50, 0],
      ],
      values: { x1: '1', x2: '9', y1: '0', y2: '40', xAxisAt: '', yAxisAt: '' },
      xAxis: { type: 'linear', label: 'Strain' },
      yAxis: { type: 'linear', label: 'Stress', unit: 'MPa' },
    });
    if (evaluation.status !== 'ok') throw new Error('expected a calibration');
    expect(calibratedReadout(evaluation.calibration, [500, 200])).toBe('Strain = 5.000 · Stress = 20.00');
  });
});
