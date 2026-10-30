import type { Graph, Project } from '../types.ts';
import { type Command, CommandError } from './command.ts';

function indexOfGraph(project: Project, graphId: string): number {
  const index = project.graphs.findIndex((g) => g.id === graphId);
  if (index < 0) throw new CommandError(`No graph with id "${graphId}"`);
  return index;
}

/** Inserts `graph` at `index` (default: the end). */
export function addGraph(graph: Graph, index?: number): Command {
  return {
    label: 'Add graph',
    apply: (project) => {
      if (project.graphs.some((g) => g.id === graph.id)) {
        throw new CommandError(`A graph with id "${graph.id}" already exists`);
      }
      const graphs = [...project.graphs];
      graphs.splice(index ?? graphs.length, 0, graph);
      return { ...project, graphs };
    },
    invert: () => removeGraph(graph.id),
  };
}

export function removeGraph(graphId: string): Command {
  return {
    label: 'Remove graph',
    apply: (project) => {
      const index = indexOfGraph(project, graphId);
      return { ...project, graphs: project.graphs.filter((_, i) => i !== index) };
    },
    invert: (before) => {
      const index = indexOfGraph(before, graphId);
      // indexOfGraph proved the index is in range.
      return addGraph(before.graphs[index] as Graph, index);
    },
  };
}

export function renameGraph(graphId: string, name: string): Command {
  return {
    label: 'Rename graph',
    apply: (project) => {
      const index = indexOfGraph(project, graphId);
      return {
        ...project,
        graphs: project.graphs.map((g, i) => (i === index ? { ...g, name } : g)),
      };
    },
    invert: (before) => renameGraph(graphId, (before.graphs[indexOfGraph(before, graphId)] as Graph).name),
  };
}

/** What re-rendering a PDF crop changes: the render and everything measured in its pixels. */
export interface GraphRender {
  readonly source: Graph['source'];
  readonly image: Graph['image'];
  readonly calibration: Graph['calibration'];
  readonly datasets: Graph['datasets'];
}

/**
 * Swaps a graph's render for a new one, e.g. the same crop at a higher DPI ("Re-render at higher DPI"). The
 * caller rescales every pixel position into the new render; the inverse swaps the old render back, whose
 * image file is still in the project.
 */
export function replaceGraphRender(graphId: string, render: GraphRender): Command {
  return {
    label: 'Re-render graph',
    apply: (project) => {
      const index = indexOfGraph(project, graphId);
      return {
        ...project,
        graphs: project.graphs.map((g, i) => (i === index ? { ...g, ...render } : g)),
      };
    },
    invert: (before) => {
      const { source, image, calibration, datasets } = before.graphs[indexOfGraph(before, graphId)] as Graph;
      return replaceGraphRender(graphId, { source, image, calibration, datasets });
    },
  };
}
