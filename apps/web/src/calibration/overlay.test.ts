import { applyTransform } from '@cd/math';
import { describe, expect, it } from 'vitest';
import { EMPTY_DRAFT, evaluateDraft } from './draft';
import { gridLines, nearestPick } from './overlay';

describe('nearestPick', () => {
  const picks = [[100, 100], null, [110, 100], [400, 50]] as const;

  it('finds the closest placed pick within the radius', () => {
    expect(nearestPick(picks, [104, 101], 10)).toBe(0);
    expect(nearestPick(picks, [107, 100], 10)).toBe(2);
    expect(nearestPick(picks, [300, 300], 10)).toBeNull();
    expect(nearestPick(EMPTY_DRAFT.picks, [0, 0], 1e9)).toBeNull();
  });
});

describe('gridLines', () => {
  // A chart turned 2° on the scan: X = 10, 90 and Y = 10, 50, with the axes crossing at (0, 0).
  const turn = (2 * Math.PI) / 180;
  const at = (u: number, v: number): [number, number] => {
    const [x, y] = [200 + 20 * u, 1450 - 20 * v];
    return [
      200 + (x - 200) * Math.cos(turn) - (y - 1450) * Math.sin(turn),
      1450 + (x - 200) * Math.sin(turn) + (y - 1450) * Math.cos(turn),
    ];
  };
  const evaluation = evaluateDraft({
    ...EMPTY_DRAFT,
    picks: [at(10, 0), at(90, 0), at(0, 10), at(0, 50)],
    values: { x1: '10', x2: '90', y1: '10', y2: '50', xAxisAt: '', yAxisAt: '' },
  });
  if (evaluation.status !== 'ok') throw new Error('expected a calibration');
  const { calibration } = evaluation;
  const lines = gridLines(calibration, { width: 2400, height: 1600 });

  it('draws the typed ticks and the two axes as lines of constant value', () => {
    const constant = lines.map(({ from, to }) => {
      const [a, b] = [applyTransform(calibration.matrix, from), applyTransform(calibration.matrix, to)];
      return Math.abs(a[0] - b[0]) < 1e-9 ? ['u', a[0]] : Math.abs(a[1] - b[1]) < 1e-9 ? ['v', a[1]] : null;
    });
    const rounded = constant.map((c) =>
      c === null ? null : [c[0], Math.round((c[1] as number) * 1e6) / 1e6 + 0],
    );
    expect(rounded).toEqual([
      ['u', 10],
      ['u', 90],
      ['v', 10],
      ['v', 50],
      ['v', 0],
      ['u', 0],
    ]);
    expect(lines.map((l) => l.axis)).toEqual([false, false, false, false, true, true]);
  });

  it('spans the whole image', () => {
    const xAxis = lines[4];
    if (!xAxis) throw new Error('missing axis line');
    expect(Math.min(xAxis.from[0], xAxis.to[0])).toBeLessThanOrEqual(0);
    expect(Math.max(xAxis.from[0], xAxis.to[0])).toBeGreaterThanOrEqual(2400);
  });
});
