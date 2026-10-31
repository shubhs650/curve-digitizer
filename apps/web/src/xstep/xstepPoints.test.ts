import type { Graph } from '@cd/core';
import { describe, expect, it } from 'vitest';
import { xstepPoints } from './xstepPoints';

const graph = { calibration: null } as unknown as Graph;

describe('xstepPoints', () => {
  it('skips missing X values and adds outliers excluded from fits', () => {
    let n = 0;
    const points = xstepPoints(
      graph,
      [
        { x: 0, px: [10, 20], lineWidthPx: 3, outlier: false },
        { x: 1, px: null, lineWidthPx: 0, outlier: false },
        { x: 2, px: [30, 60], lineWidthPx: 3, outlier: true },
      ],
      () => `p${String(++n)}`,
    );
    expect(points.map((p) => [p.id, p.px, p.origin, p.excludedFromFit])).toEqual([
      ['p1', [10, 20], 'xstep', false],
      ['p2', [30, 60], 'xstep', true],
    ]);
  });
});
