import type { Graph, Point } from '@cd/core';
import { type PathNode, samplePoints } from '@cd/trace';
import { placePoint } from '../points/cache';

/** The traced path as new trace points of `graph`, sampled every `spacingPx` (plus its 0.5 px DP vertices). */
export function tracePoints(
  graph: Graph,
  nodes: readonly PathNode[],
  spacingPx: number,
  newId: () => string = () => crypto.randomUUID(),
): Point[] {
  return samplePoints(nodes, spacingPx).map((p) =>
    placePoint(graph, { px: p.px, origin: 'trace', lineWidthPx: p.lineWidthPx }, { id: newId() }),
  );
}
