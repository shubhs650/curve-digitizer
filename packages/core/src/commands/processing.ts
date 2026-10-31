import type { FilterStep } from '../types.ts';
import { graphOf, withGraph } from './access.ts';
import type { Command } from './command.ts';

/**
 * Replaces a graph's pre-processing stack (adding, removing, reordering or editing a step, or applying a
 * preset). Edits with the same `coalesceKey` (one slider drag, one field focus) undo as one step.
 */
export function setProcessing(
  graphId: string,
  processing: readonly FilterStep[],
  label = 'Change pre-processing',
  coalesceKey?: string,
): Command {
  return {
    label,
    ...(coalesceKey === undefined ? {} : { coalesceKey }),
    apply: (project) => withGraph(project, graphId, (g) => ({ ...g, processing })),
    invert: (before) => setProcessing(graphId, graphOf(before, graphId).processing, label),
  };
}
