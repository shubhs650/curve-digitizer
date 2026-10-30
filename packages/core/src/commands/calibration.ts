import type { Calibration, Graph, Vec2 } from '../types.ts';
import { graphOf, withGraph } from './access.ts';
import type { Command } from './command.ts';

/** A point's calibrated cache: `Point.value` and `Point.sigma`, by point id. */
export type PointValues = ReadonlyMap<string, { readonly value: Vec2; readonly sigma: Vec2 }>;

/** The value and sigma caches of every point of a graph. */
export function pointValuesOf(graph: Graph): PointValues {
  return new Map(graph.datasets.flatMap((d) => d.points.map((p) => [p.id, { value: p.value, sigma: p.sigma }])));
}

/**
 * Replaces a graph's calibration. `values` carries the points' new `value`/`sigma` caches, computed by the caller
 * through the new calibration (core has no numerics); points it does not name keep theirs. The inverse restores
 * the previous calibration and caches, so undo never leaves values computed through a calibration that is gone.
 */
export function setCalibration(
  graphId: string,
  calibration: Calibration | null,
  values: PointValues = new Map(),
  coalesceKey?: string,
): Command {
  return {
    label: calibration === null ? 'Clear calibration' : 'Calibrate',
    ...(coalesceKey === undefined ? {} : { coalesceKey }),
    apply: (project) =>
      withGraph(project, graphId, (g) => ({
        ...g,
        calibration,
        datasets: g.datasets.map((d) => ({
          ...d,
          points: d.points.map((p) => {
            const cached = values.get(p.id);
            return cached === undefined ? p : { ...p, value: cached.value, sigma: cached.sigma };
          }),
        })),
      })),
    invert: (before) => {
      const graph = graphOf(before, graphId);
      return setCalibration(graphId, graph.calibration, pointValuesOf(graph));
    },
  };
}
