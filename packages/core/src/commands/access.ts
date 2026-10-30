import type { Dataset, Graph, Project } from '../types.ts';
import { CommandError } from './command.ts';

// Lookups and copy-on-write updates shared by commands. Each throws CommandError for an unknown id, so a
// command dispatched against a project that has since changed fails loudly instead of doing nothing.

export function graphOf(project: Project, graphId: string): Graph {
  const graph = project.graphs.find((g) => g.id === graphId);
  if (!graph) throw new CommandError(`No graph with id "${graphId}"`);
  return graph;
}

export function datasetOf(project: Project, graphId: string, datasetId: string): Dataset {
  const dataset = graphOf(project, graphId).datasets.find((d) => d.id === datasetId);
  if (!dataset) throw new CommandError(`No dataset with id "${datasetId}" in graph "${graphId}"`);
  return dataset;
}

export function withGraph(project: Project, graphId: string, update: (graph: Graph) => Graph): Project {
  graphOf(project, graphId);
  return { ...project, graphs: project.graphs.map((g) => (g.id === graphId ? update(g) : g)) };
}

export function withDataset(
  project: Project,
  graphId: string,
  datasetId: string,
  update: (dataset: Dataset) => Dataset,
): Project {
  datasetOf(project, graphId, datasetId);
  return withGraph(project, graphId, (g) => ({
    ...g,
    datasets: g.datasets.map((d) => (d.id === datasetId ? update(d) : d)),
  }));
}
