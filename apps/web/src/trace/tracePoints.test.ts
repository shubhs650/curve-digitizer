import type { Graph } from '@cd/core';
import type { PathNode } from '@cd/trace';
import { describe, expect, it } from 'vitest';
import { tracePoints } from './tracePoints';

const graph = { calibration: null } as unknown as Graph;
const nodes: PathNode[] = Array.from({ length: 21 }, (_, i) => ({ px: [i, 2 * i], width: 3 }));

describe('tracePoints', () => {
  it('samples the path at the spacing as trace points with the stroke width', () => {
    let n = 0;
    const points = tracePoints(graph, nodes, 2 * Math.hypot(1, 2), () => `p${String(++n)}`);
    expect(points.map((p) => p.px[0])).toEqual([0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20]);
    expect(points[0]?.id).toBe('p1');
    expect(points.every((p) => p.origin === 'trace' && p.lineWidthPx === 3)).toBe(true);
  });
});
