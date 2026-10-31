import type { Graph, Vec2 } from '@cd/core';
import type { Rgb } from '@cd/image';
import { imageSource } from '../processing/processedImage';
import { computePool } from '../session/compute';
import { useMaskStore } from './maskStore';

export interface MaskRun {
  readonly pick: Vec2;
  /** Re-runs keep the first run's colour, so only the tolerance changes. */
  readonly color?: Rgb;
  readonly tolerance?: number;
}

let current: AbortController | null = null;

/** Cancels the run in flight, keeping the last result. */
export function cancelMask(): void {
  current?.abort();
  current = null;
  useMaskStore.getState().setSession((s) => (s ? { ...s, running: false } : s));
}

/** Ends the session (and any run). */
export function clearMask(): void {
  current?.abort();
  current = null;
  useMaskStore.getState().setSession(() => null);
}

/**
 * Runs the colour mask in the compute pool on the graph's processed image; a newer run cancels this one.
 * A new pick starts a new session; a re-run with the same pick keeps the components the user kept, as far as
 * they still exist.
 */
export async function runMask(
  graph: Graph,
  readFile: (path: string) => Promise<Uint8Array>,
  run: MaskRun,
): Promise<void> {
  current?.abort();
  const abort = new AbortController();
  current = abort;
  const { setSession } = useMaskStore.getState();
  setSession((s) => {
    const same = s?.graphId === graph.id && s.pick === run.pick;
    return {
      graphId: graph.id,
      pick: run.pick,
      color: run.color ?? null,
      tolerance: run.tolerance ?? null,
      running: true,
      fraction: 0,
      result: same ? s.result : null,
      kept: same ? s.kept : new Set(),
      error: null,
    };
  });
  const stale = () => abort.signal.aborted;
  try {
    const { source, transfer } = await imageSource(graph, readFile);
    const outcome = await computePool().run(
      'maskCurves',
      {
        source,
        steps: graph.processing,
        pick: run.pick,
        ...(run.color === undefined ? {} : { color: run.color }),
        ...(run.tolerance === undefined ? {} : { options: { tolerance: run.tolerance } }),
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
    setSession((s) => {
      if (!s) return s;
      const carried = [...s.kept].filter((i) => i < result.components.length);
      const kept = s.result === null && result.picked >= 0 ? [result.picked] : carried;
      return {
        ...s,
        color: result.color,
        tolerance: result.tolerance,
        running: false,
        fraction: 1,
        result,
        kept: new Set(kept),
      };
    });
  } catch (error) {
    if (stale()) return;
    setSession((s) =>
      s ? { ...s, running: false, error: error instanceof Error ? error.message : String(error) } : s,
    );
  } finally {
    if (current === abort) current = null;
  }
}
