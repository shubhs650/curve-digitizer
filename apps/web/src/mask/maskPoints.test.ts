import type { Graph } from '@cd/core';
import type { MaskComponent } from '@cd/trace';
import { describe, expect, it } from 'vitest';
import { maskPoints } from './maskPoints';

const component = (y: number): MaskComponent => ({
  path: [
    [0.5, y],
    [10.5, y],
  ],
  points: [
    { px: [0.5, y], lineWidthPx: 2 },
    { px: [10.5, y], lineWidthPx: 2 },
  ],
  lengthPx: 10,
  lineWidthPx: 2,
});

const graph = { calibration: null } as unknown as Graph;

describe('maskPoints', () => {
  it('turns the kept components into trace points in list order', () => {
    let n = 0;
    const points = maskPoints(
      graph,
      [component(1), component(5), component(9)],
      new Set([2, 0]),
      () => `p${String(++n)}`,
    );
    expect(points.map((p) => [p.id, p.px[1]])).toEqual([
      ['p1', 1],
      ['p2', 1],
      ['p3', 9],
      ['p4', 9],
    ]);
    expect(points.every((p) => p.origin === 'trace' && p.lineWidthPx === 2 && !p.excludedFromFit)).toBe(true);
  });
});
