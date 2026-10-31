import type { Fit } from '../types.ts';
import { datasetOf, graphOf, withGraph } from './access.ts';
import { type Command, CommandError } from './command.ts';

/**
 * Makes `fit` the dataset's fit, replacing any it had (task 3.2: one accepted fit per dataset), or removes the
 * dataset's fits when `fit` is null. The new fit takes the place of the first replaced one so the graph's fit
 * order stays stable; the inverse restores the graph's whole fit list.
 */
export function setDatasetFit(graphId: string, datasetId: string, fit: Fit | null): Command {
  return {
    label: fit === null ? 'Remove fit' : 'Fit',
    apply: (project) => {
      datasetOf(project, graphId, datasetId);
      if (fit !== null && fit.datasetId !== datasetId) {
        throw new CommandError(`Fit "${fit.id}" belongs to dataset "${fit.datasetId}", not "${datasetId}"`);
      }
      return withGraph(project, graphId, (g) => {
        const at = g.fits.findIndex((f) => f.datasetId === datasetId);
        const rest = g.fits.filter((f) => f.datasetId !== datasetId);
        if (fit === null) return { ...g, fits: rest };
        const fits = [...rest];
        fits.splice(at === -1 ? fits.length : at, 0, fit);
        return { ...g, fits };
      });
    },
    invert: (before) => {
      const fits = graphOf(before, graphId).fits;
      return {
        label: fit === null ? 'Remove fit' : 'Fit',
        apply: (project) => withGraph(project, graphId, (g) => ({ ...g, fits })),
        invert: () => setDatasetFit(graphId, datasetId, fit),
      };
    },
  };
}
