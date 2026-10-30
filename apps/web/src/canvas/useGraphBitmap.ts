import type { Graph } from '@cd/core';
import { useEffect, useState } from 'react';
import { useWorkspace } from '../session/context';

export type BitmapState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly bitmap: ImageBitmap }
  | { readonly status: 'error'; readonly message: string };

/**
 * Decodes a graph's stored image. `createImageBitmap` decodes off the main thread, and the bitmap is closed
 * when the graph changes so GPU memory does not pile up while switching graphs.
 */
export function useGraphBitmap(graph: Graph): BitmapState {
  const workspace = useWorkspace();
  const [state, setState] = useState<BitmapState>({ status: 'loading' });
  const path = graph.image.path;

  useEffect(() => {
    let alive = true;
    let bitmap: ImageBitmap | null = null;
    setState({ status: 'loading' });
    workspace
      .readFile(path)
      .then((bytes) => createImageBitmap(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'image/png' })))
      .then((decoded) => {
        if (!alive) {
          decoded.close();
          return;
        }
        bitmap = decoded;
        setState({ status: 'ready', bitmap: decoded });
      })
      .catch((error: unknown) => {
        if (alive)
          setState({ status: 'error', message: error instanceof Error ? error.message : String(error) });
      });
    return () => {
      alive = false;
      bitmap?.close();
    };
  }, [workspace, path]);

  return state;
}
