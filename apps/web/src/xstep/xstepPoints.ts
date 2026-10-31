import type { Graph, Point } from '@cd/core';
import type { XStepPoint } from '@cd/trace';
import { placePoint } from '../points/cache';

/** The sampled points as new X-step points of `graph`; outliers are added excluded from fits, so they stay visible. */
export function xstepPoints(
  graph: Graph,
  points: readonly XStepPoint[],
  newId: () => string = () => crypto.randomUUID(),
): Point[] {
  return points.flatMap((p) => {
    if (p.px === null) return [];
    const point = placePoint(
      graph,
      { px: p.px, origin: 'xstep', lineWidthPx: p.lineWidthPx },
      { id: newId() },
    );
    return [p.outlier ? { ...point, excludedFromFit: true } : point];
  });
}
