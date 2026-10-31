import type { Dataset, Graph, Vec2 } from '@cd/core';
import { imageSource } from '../processing/processedImage';
import { computePool } from '../session/compute';
import { useXStepStore } from './xstepStore';

let current: AbortController | null = null;

/** Why X-step cannot add to this dataset, or null: path datasets (loops) have no single Y per X (PRD §4.7). */
export function pathDatasetBlock(dataset: Dataset | null): string | null {
  return dataset?.mode === 'path'
    ? `X-step needs a function dataset; ${dataset.name} is a path. Choose or add a function dataset`
    : null;
}

export function cancelXStep(): void {
  current?.abort();
  current = null;
  useXStepStore.getState().setSession((s) => (s ? { ...s, running: false } : s));
}

export function clearXStep(): void {
  current?.abort();
  current = null;
  useXStepStore.getState().setSession(() => null);
}

/** Samples the curve through `start` at `xs` in the compute pool, on the graph's processed image. */
export async function runXStep(
  graph: Graph,
  readFile: (path: string) => Promise<Uint8Array>,
  start: Vec2,
  xs: readonly number[],
): Promise<void> {
  const calibration = graph.calibration;
  if (calibration === null) return;
  current?.abort();
  const abort = new AbortController();
  current = abort;
  const stale = () => abort.signal.aborted;
  const { setSession } = useXStepStore.getState();
  setSession(() => ({ graphId: graph.id, start, running: true, fraction: 0, result: null, error: null }));
  try {
    const { source, transfer } = await imageSource(graph, readFile);
    const outcome = await computePool().run(
      'sampleCurveXs',
      {
        source,
        steps: graph.processing,
        options: {
          start,
          xs,
          matrix: calibration.matrix,
          axes: { x: calibration.xAxis.type, y: calibration.yAxis.type },
        },
      },
      {
        signal: abort.signal,
        transfer,
        onProgress: (p) => {
          if (!stale()) setSession((s) => (s ? { ...s, fraction: p.fraction } : s));
        },
      },
    );
    if (outcome.status === 'cancelled' || stale()) return;
    const result = outcome.value;
    setSession((s) => (s ? { ...s, running: false, fraction: 1, result } : s));
  } catch (error) {
    if (stale()) return;
    setSession((s) =>
      s ? { ...s, running: false, error: error instanceof Error ? error.message : String(error) } : s,
    );
  } finally {
    if (current === abort) current = null;
  }
}
