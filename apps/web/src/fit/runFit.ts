import type { ModelSpec } from '@cd/fit';
import { computePool } from '../session/compute';
import type { FitInputs } from './fitInputs';
import { useFitStore } from './fitStore';

let current: AbortController | null = null;

export function cancelFit(): void {
  current?.abort();
  current = null;
  useFitStore.getState().setSession((s) => (s ? { ...s, running: false } : s));
}

export function clearFit(): void {
  current?.abort();
  current = null;
  useFitStore.getState().setSession(() => null);
}

/** Auto-recommend (no `spec`) or one model, in the compute pool with progress and cancel. */
export async function runFit(
  graphId: string,
  datasetId: string,
  inputs: FitInputs,
  spec?: ModelSpec,
): Promise<void> {
  current?.abort();
  const abort = new AbortController();
  current = abort;
  const stale = () => abort.signal.aborted;
  const { setSession } = useFitStore.getState();
  setSession(() => ({
    graphId,
    datasetId,
    running: true,
    fraction: 0,
    result: null,
    spec,
    error: null,
    previewIndex: 0,
  }));
  try {
    const outcome = await computePool().run(
      'fitDataset',
      { x: inputs.x, y: inputs.y, space: inputs.space, ...(spec === undefined ? {} : { spec }) },
      {
        signal: abort.signal,
        onProgress: (p) => {
          if (!stale()) setSession((s) => (s ? { ...s, fraction: p.fraction } : s));
        },
      },
    );
    if (outcome.status === 'cancelled' || stale()) return;
    const result = outcome.value;
    setSession((s) =>
      s
        ? {
            ...s,
            running: false,
            fraction: 1,
            result,
            previewIndex: Math.max(0, result.recommended),
            error: result.fits.length === 0 ? 'This model cannot be fitted to these points.' : null,
          }
        : s,
    );
  } catch (error) {
    if (stale()) return;
    setSession((s) =>
      s ? { ...s, running: false, error: error instanceof Error ? error.message : String(error) } : s,
    );
  } finally {
    if (current === abort) current = null;
  }
}
