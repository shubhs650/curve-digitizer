import type { Graph } from '@cd/core';
import { stackHash, type StepIssue } from '@cd/image';
import type { ImageSource } from '@cd/workers';
import { useEffect, useRef, useState } from 'react';
import { computePool } from '../session/compute';
import { useWorkspace } from '../session/context';

/** The compute worker's cache key for a graph's stored image. */
export function imageSourceKey(graph: Graph): string {
  return `${graph.id}:${graph.image.path}`;
}

/** The graph's image as the compute worker reads it: the stored PNG, decoded (and cached) there. */
export async function imageSource(
  graph: Graph,
  readFile: (path: string) => Promise<Uint8Array>,
): Promise<{
  readonly source: ImageSource;
  readonly transfer: Transferable[];
}> {
  const bytes = await readFile(graph.image.path);
  const png = bytes.slice().buffer;
  return { source: { key: imageSourceKey(graph), png }, transfer: [png] };
}

export type ProcessedState =
  | { readonly status: 'off' }
  | { readonly status: 'running'; readonly fraction: number }
  | { readonly status: 'ready'; readonly bitmap: ImageBitmap; readonly issues: readonly StepIssue[] }
  | { readonly status: 'error'; readonly message: string };

/** Edits closer together than this (a slider drag) start one run, not one per change. */
const DEBOUNCE_MS = 120;

/**
 * The graph's processed image for the before/after preview, recomputed in the compute pool whenever the stack
 * changes (cached there per stack hash, so going back to an earlier stack is instant). A newer stack cancels
 * the run in flight. `enabled` false releases the bitmap.
 */
export function useProcessedImage(graph: Graph, enabled: boolean): ProcessedState {
  const workspace = useWorkspace();
  const [state, setState] = useState<ProcessedState>({ status: 'off' });
  // The bitmap on screen; it stays shown while the next stack runs and is closed once replaced.
  const shown = useRef<ImageBitmap | null>(null);
  const hash = stackHash(graph.processing);
  const key = imageSourceKey(graph);
  const { processing } = graph;

  useEffect(() => {
    const release = () => {
      shown.current?.close();
      shown.current = null;
    };
    if (!enabled) {
      setState({ status: 'off' });
      release();
      return;
    }
    const abort = new AbortController();
    // A function, so TypeScript does not narrow `aborted` to false across the awaits.
    const stale = () => abort.signal.aborted;
    setState((s) => (s.status === 'ready' ? s : { status: 'running', fraction: 0 }));
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const { source, transfer } = await imageSource(graph, (path) => workspace.readFile(path));
          const outcome = await computePool().run(
            'processImage',
            { source, steps: processing },
            {
              signal: abort.signal,
              transfer,
              onProgress: (p) => {
                if (!abort.signal.aborted)
                  setState((s) => (s.status === 'ready' ? s : { status: 'running', fraction: p.fraction }));
              },
            },
          );
          if (outcome.status === 'cancelled' || abort.signal.aborted) return;
          const { rgba, width, height, issues } = outcome.value;
          const decoded = await createImageBitmap(new ImageData(new Uint8ClampedArray(rgba), width, height));
          if (stale()) {
            decoded.close();
            return;
          }
          const previous = shown.current;
          shown.current = decoded;
          setState({ status: 'ready', bitmap: decoded, issues });
          // Closed after React has painted with the new one.
          if (previous) {
            setTimeout(() => {
              previous.close();
            }, 0);
          }
        } catch (error) {
          if (!abort.signal.aborted) {
            setState({ status: 'error', message: error instanceof Error ? error.message : String(error) });
          }
        }
      })();
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
    // `graph` matters only through `key` (id + image path) and `hash` (its stack).
  }, [enabled, hash, key, workspace]);

  useEffect(
    () => () => {
      shown.current?.close();
    },
    [],
  );

  return state;
}
