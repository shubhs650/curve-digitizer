import type { Graph } from '@cd/core';
import { describe, expect, it } from 'vitest';
import {
  type CalibrationDraft,
  draftFromCalibration,
  EMPTY_DRAFT,
  evaluateDraft,
  numberText,
  pointValues,
} from './draft';

// vector-clean's recorded calibration (samples/vector-clean/ops.json): linear axes, the X axis at y = 0.
const CLEAN: CalibrationDraft = {
  ...EMPTY_DRAFT,
  picks: [
    [412, 1450],
    [2108, 1450],
    [200, 1226.7],
    [200, 333.3],
  ],
  values: { x1: '10', x2: '90', y1: '10', y2: '50', xAxisAt: '0', yAxisAt: '0' },
  xAxis: { type: 'linear', label: 'Flow rate Q', unit: 'm³/h' },
  yAxis: { type: 'linear', label: 'Head H', unit: 'm' },
};

// sn-family: log-log, the X axis at y = 10 and the Y axis at x = 10 (axis minima, not typed ticks).
const SN: CalibrationDraft = {
  ...EMPTY_DRAFT,
  picks: [
    [500, 1330],
    [1620, 1330],
    [220, 923.3],
    [220, 516.7],
  ],
  values: { x1: '100', x2: '1000000', y1: '100', y2: '1000', xAxisAt: '10', yAxisAt: '10' },
  xAxis: { type: 'log10', label: 'Cycles N' },
  yAxis: { type: 'log10', label: 'Stress amplitude S', unit: 'MPa' },
};

function ok(draft: CalibrationDraft) {
  const result = evaluateDraft(draft);
  if (result.status !== 'ok') throw new Error(`expected ok, got ${JSON.stringify(result)}`);
  return result;
}

describe('evaluateDraft', () => {
  it('solves the recorded calibrations within A1', () => {
    for (const draft of [CLEAN, SN]) {
      const { calibration } = ok(draft);
      expect(calibration.residualPx).toBeLessThan(0.3);
      expect(calibration.points.map((p) => p.px)).toEqual(draft.picks);
      expect(calibration.warnings).toEqual([]);
    }
    expect(ok(SN).calibration.points[0]?.axis).toEqual([2, 1]);
  });

  it('solves where the axes cross when left blank (exact affine)', () => {
    const result = ok({ ...SN, values: { ...SN.values, xAxisAt: '', yAxisAt: '' } });
    expect(result.crossings.solved).toBe(true);
    expect(result.crossings.xAxisAt).toBeCloseTo(10, 1);
    expect(result.crossings.yAxisAt).toBeCloseTo(10, 1);
    expect(result.calibration.residualPx).toBeLessThan(1e-9);
  });

  it('reports what is missing or wrong, field by field', () => {
    expect(evaluateDraft(EMPTY_DRAFT)).toMatchObject({ status: 'incomplete', missingPicks: [0, 1, 2, 3] });
    const bad = evaluateDraft({ ...SN, values: { ...SN.values, x1: 'abc', y1: '-5', y2: '' } });
    expect(bad).toEqual({
      status: 'invalid',
      errors: { x1: 'Enter a number', y1: 'A log axis needs a value above 0', y2: 'Enter a value' },
    });
    expect(evaluateDraft({ ...CLEAN, values: { ...CLEAN.values, x2: '10' } })).toMatchObject({
      errors: { x2: 'Use two different X values' },
    });
    expect(
      evaluateDraft({ ...CLEAN, model: 'projective', values: { ...CLEAN.values, xAxisAt: '' } }),
    ).toMatchObject({ errors: { xAxisAt: 'Projective needs this value' } });
  });

  it('explains degenerate clicks', () => {
    const stacked: CalibrationDraft = {
      ...CLEAN,
      picks: [
        [100, 100],
        [100, 100],
        [100, 100],
        [100, 100],
      ],
      values: { ...CLEAN.values, xAxisAt: '', yAxisAt: '' },
    };
    expect(evaluateDraft(stacked)).toMatchObject({ status: 'invalid', message: /do not define a calibration/ });
  });

  it('flags a wrong crossing with a warning sentence', () => {
    const { calibration } = ok({ ...CLEAN, values: { ...CLEAN.values, xAxisAt: '5' } });
    expect(calibration.residualPx).toBeGreaterThan(1);
    expect(calibration.warnings).toContainEqual(expect.stringMatching(/check the typed values, where the axes cross/));
  });
});

describe('draftFromCalibration', () => {
  it('round-trips a calibration through the editor', () => {
    for (const draft of [CLEAN, SN]) {
      const back = draftFromCalibration(ok(draft).calibration);
      expect(back).toEqual(draft);
    }
  });

  it('leaves solved crossings blank', () => {
    const blank = { ...SN, values: { ...SN.values, xAxisAt: '', yAxisAt: '' } };
    expect(draftFromCalibration(ok(blank).calibration).values).toEqual(blank.values);
    expect(draftFromCalibration(null)).toBe(EMPTY_DRAFT);
  });
});

describe('numberText and pointValues', () => {
  it('prints short numbers', () => {
    expect(numberText(0.1 + 0.2)).toBe('0.3');
    expect(numberText(1e6)).toBe('1000000');
  });

  it('computes point caches through the calibration', () => {
    const { calibration } = ok(CLEAN);
    const graph = {
      datasets: [
        {
          points: [{ id: 'p', px: [412, 1450], value: [0, 0], sigma: [0, 0], lineWidthPx: 2 }],
        },
      ],
    } as unknown as Graph;
    const cached = pointValues(graph, calibration).get('p');
    expect(cached?.value[0]).toBeCloseTo(10, 2);
    expect(cached?.value[1]).toBeCloseTo(0, 2);
    expect(cached?.sigma[0]).toBeGreaterThan(0);
  });
});
