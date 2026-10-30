import type { Point, Project } from '../types.ts';
import { datasetOf, graphOf, withDataset } from './access.ts';
import { type Command, CommandError } from './command.ts';

/** A point of a graph, as selections and point commands name it. */
export interface PointRef {
  readonly datasetId: string;
  readonly pointId: string;
}

export interface PointInsert {
  readonly datasetId: string;
  readonly point: Point;
  /** Position in the dataset after the earlier inserts of the same command; default the end. */
  readonly index?: number;
}

const plural = (verb: string, n: number) => (n === 1 ? `${verb} point` : `${verb} ${String(n)} points`);

/** Inserts points, in order; the inverse removes them. */
export function insertPoints(graphId: string, inserts: readonly PointInsert[]): Command {
  return {
    label: plural('Add', inserts.length),
    apply: (project) =>
      inserts.reduce(
        (p, { datasetId, point, index }) =>
          withDataset(p, graphId, datasetId, (d) => {
            if (d.points.some((q) => q.id === point.id)) {
              throw new CommandError(`A point with id "${point.id}" already exists`);
            }
            const points = [...d.points];
            points.splice(index ?? points.length, 0, point);
            return { ...d, points };
          }),
        project,
      ),
    invert: () =>
      removePoints(
        graphId,
        inserts.map(({ datasetId, point }) => ({ datasetId, pointId: point.id })),
      ),
  };
}

/** Removes points; the inverse puts each back at its index in its dataset. */
export function removePoints(graphId: string, refs: readonly PointRef[]): Command {
  return {
    label: plural('Delete', refs.length),
    apply: (project) => {
      for (const ref of refs) pointOf(project, graphId, ref);
      return refs.reduce(
        (p, { datasetId, pointId }) =>
          withDataset(p, graphId, datasetId, (d) => ({
            ...d,
            points: d.points.filter((q) => q.id !== pointId),
          })),
        project,
      );
    },
    invert: (before) => {
      const graph = graphOf(before, graphId);
      // Re-inserting in ascending index order within each dataset lands every point where it was.
      const inserts = refs
        .map((ref) => {
          const dataset = datasetOf(before, graphId, ref.datasetId);
          const index = dataset.points.findIndex((q) => q.id === ref.pointId);
          return { datasetId: ref.datasetId, index, point: pointOf(before, graphId, ref) };
        })
        .sort(
          (a, b) =>
            graph.datasets.findIndex((d) => d.id === a.datasetId) -
              graph.datasets.findIndex((d) => d.id === b.datasetId) || a.index - b.index,
        );
      return { ...insertPoints(graphId, inserts), label: plural('Delete', refs.length) };
    },
  };
}

/**
 * Replaces points with new versions of themselves (same id): moves, nudges, re-snaps, recalculated values.
 * Successive replacements with the same `coalesceKey` (one drag, one held arrow key) undo as one step.
 */
export function replacePoints(
  graphId: string,
  points: readonly { readonly datasetId: string; readonly point: Point }[],
  label = plural('Move', points.length),
  coalesceKey?: string,
): Command {
  return {
    label,
    ...(coalesceKey === undefined ? {} : { coalesceKey }),
    apply: (project) =>
      points.reduce((p, { datasetId, point }) => {
        pointOf(p, graphId, { datasetId, pointId: point.id });
        return withDataset(p, graphId, datasetId, (d) => ({
          ...d,
          points: d.points.map((q) => (q.id === point.id ? point : q)),
        }));
      }, project),
    invert: (before) =>
      replacePoints(
        graphId,
        points.map(({ datasetId, point }) => ({
          datasetId,
          point: pointOf(before, graphId, { datasetId, pointId: point.id }),
        })),
        label,
      ),
  };
}

function pointOf(project: Project, graphId: string, ref: PointRef): Point {
  const point = datasetOf(project, graphId, ref.datasetId).points.find((q) => q.id === ref.pointId);
  if (!point) throw new CommandError(`No point with id "${ref.pointId}" in dataset "${ref.datasetId}"`);
  return point;
}
