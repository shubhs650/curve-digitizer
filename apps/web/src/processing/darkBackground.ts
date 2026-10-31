import type { Graph } from '@cd/core';
import { isDarkBackground } from '@cd/image';
import { useEffect, useState } from 'react';
import { useWorkspace } from '../session/context';

/** Width the image is decoded at for the check: the paper's median needs no detail. */
const PROBE_WIDTH = 128;

/** Whether the graph's image has a dark background (PRD §4.11), from a small decode; false until known. */
export function useDarkBackground(graph: Graph): boolean {
  const workspace = useWorkspace();
  const [dark, setDark] = useState(false);
  const path = graph.image.path;
  useEffect(() => {
    const run = { alive: true };
    setDark(false);
    void (async () => {
      try {
        const bytes = await workspace.readFile(path);
        const bitmap = await createImageBitmap(
          new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'image/png' }),
          {
            resizeWidth: PROBE_WIDTH,
            resizeQuality: 'low',
          },
        );
        const ctx = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d', {
          willReadFrequently: true,
        });
        if (!ctx) return;
        ctx.drawImage(bitmap, 0, 0);
        const { data, width, height } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
        bitmap.close();
        if (run.alive) setDark(isDarkBackground({ width, height, channels: 4, data }));
      } catch {
        // No decoder (tests) or an unreadable image: no hint, which is the safe default.
      }
    })();
    return () => {
      run.alive = false;
    };
  }, [workspace, path]);
  return dark;
}
