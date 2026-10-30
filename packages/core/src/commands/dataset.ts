import type { Dataset, DatasetMode, DatasetParam, Point } from '../types.ts';
import { datasetOf, graphOf, withDataset, withGraph } from './access.ts';
import { type Command, CommandError } from './command.ts';

/** Inserts `dataset` into a graph at `index` (default: the end). */
export function addDataset(graphId: string, dataset: Dataset, index?: number): Command {
  return {
    label: 'Add dataset',
    apply: (project) =>
      withGraph(project, graphId, (g) => {
        if (g.datasets.some((d) => d.id === dataset.id)) {
          throw new CommandError(`A dataset with id "${dataset.id}" already exists`);
        }
        const datasets = [...g.datasets];
        datasets.splice(index ?? datasets.length, 0, dataset);
        return { ...g, datasets };
      }),
    invert: () => removeDataset(graphId, dataset.id),
  };
}

/** Removes a dataset and its points; fits of the dataset stay with it so undo restores them too. */
export function removeDataset(graphId: string, datasetId: string): Command {
  return {
    label: 'Delete dataset',
    apply: (project) => {
      datasetOf(project, graphId, datasetId);
      return withGraph(project, graphId, (g) => ({
        ...g,
        datasets: g.datasets.filter((d) => d.id !== datasetId),
        fits: g.fits.filter((f) => f.datasetId !== datasetId),
      }));
    },
    invert: (before) => {
      const graph = graphOf(before, graphId);
      const dataset = datasetOf(before, graphId, datasetId);
      const index = graph.datasets.indexOf(dataset);
      return {
        label: 'Delete dataset',
        // Undo runs against the project this command produced, so the graph's other fits are unchanged
        // and restoring the whole list puts the dataset's fits back in their original order.
        apply: (project) =>
          withGraph(addDataset(graphId, dataset, index).apply(project), graphId, (g) => ({
            ...g,
            fits: graph.fits,
          })),
        invert: () => removeDataset(graphId, datasetId),
      };
    },
  };
}

/** The editable descriptive fields of a dataset. `param: null` removes the family parameter. */
export interface DatasetPatch {
  readonly name?: string;
  readonly color?: string;
  readonly mode?: DatasetMode;
  readonly param?: DatasetParam | null;
  readonly xUnit?: string;
  readonly yUnit?: string;
  readonly sourceRef?: string;
  readonly notes?: string;
}

const PATCH_KEYS = ['name', 'color', 'mode', 'param', 'xUnit', 'yUnit', 'sourceRef', 'notes'] as const;

function applyPatch(dataset: Dataset, patch: DatasetPatch): Dataset {
  const { param, ...rest } = patch;
  const next: Dataset = { ...dataset, ...stripUndefined(rest) };
  if (param === undefined) return next;
  if (param === null) {
    const withoutParam: { -readonly [K in keyof Dataset]?: Dataset[K] } & Omit<Dataset, 'param'> = {
      ...next,
    };
    delete withoutParam.param;
    return withoutParam;
  }
  return { ...next, param };
}

function stripUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/** Changes descriptive fields; the inverse restores exactly the fields the patch touched. */
export function updateDataset(
  graphId: string,
  datasetId: string,
  patch: DatasetPatch,
  coalesceKey?: string,
): Command {
  return {
    label: 'Edit dataset',
    ...(coalesceKey === undefined ? {} : { coalesceKey }),
    apply: (project) => withDataset(project, graphId, datasetId, (d) => applyPatch(d, patch)),
    invert: (before) => {
      const old = datasetOf(before, graphId, datasetId);
      const restore: Record<string, unknown> = {};
      for (const key of PATCH_KEYS) {
        if (patch[key] === undefined) continue;
        restore[key] = key === 'param' ? (old.param ?? null) : old[key];
      }
      return updateDataset(graphId, datasetId, restore);
    },
  };
}

export interface PointFlags {
  readonly excludedFromFit?: boolean;
  readonly outOfRange?: boolean;
}

/** Sets flags on some points of a dataset; the inverse restores each point's previous flags. */
export function setPointFlags(
  graphId: string,
  datasetId: string,
  pointIds: readonly string[],
  flags: PointFlags,
): Command {
  return {
    label: 'Change point flags',
    apply: (project) =>
      withDataset(project, graphId, datasetId, (d) => {
        const ids = new Set(pointIds);
        for (const id of ids) {
          if (!d.points.some((p) => p.id === id)) throw new CommandError(`No point with id "${id}"`);
        }
        return {
          ...d,
          points: d.points.map((p) => (ids.has(p.id) ? { ...p, ...stripUndefined(flags) } : p)),
        };
      }),
    invert: (before) => {
      const old = new Map<string, Point>(datasetOf(before, graphId, datasetId).points.map((p) => [p.id, p]));
      const restore: Command[] = pointIds.map((id) => {
        const p = old.get(id);
        if (!p) throw new CommandError(`No point with id "${id}"`);
        return setPointFlags(graphId, datasetId, [id], {
          excludedFromFit: p.excludedFromFit,
          outOfRange: p.outOfRange,
        });
      });
      return {
        label: 'Change point flags',
        apply: (project) => restore.reduce((p, c) => c.apply(p), project),
        invert: () => setPointFlags(graphId, datasetId, pointIds, flags),
      };
    },
  };
}
