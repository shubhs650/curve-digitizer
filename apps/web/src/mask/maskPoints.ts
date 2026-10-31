import type { Graph, Point } from '@cd/core';
import type { MaskComponent } from '@cd/trace';
import { placePoint } from '../points/cache';

/** The kept components' output points, as new trace points of `graph`, component by component in list order. */
export function maskPoints(
  graph: Graph,
  components: readonly MaskComponent[],
  kept: ReadonlySet<number>,
  newId: () => string = () => crypto.randomUUID(),
): Point[] {
  return components.flatMap((c, i) =>
    kept.has(i)
      ? c.points.map((p) =>
          placePoint(graph, { px: p.px, origin: 'trace', lineWidthPx: p.lineWidthPx }, { id: newId() }),
        )
      : [],
  );
}
