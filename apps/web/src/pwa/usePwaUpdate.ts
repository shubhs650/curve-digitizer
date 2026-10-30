import { useCallback, useEffect, useRef, useState } from 'react';
import { Workbox } from 'workbox-window';
import { registerServiceWorker } from './register';
import type { UpdateClient, UpdateController } from './register';

// The service worker only exists in the production build (vite-plugin-pwa emits /sw.js at build time).
export function createWorkboxClient(): UpdateClient | null {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return null;
  return new Workbox('/sw.js', { scope: '/' });
}

function reloadPage(): void {
  window.location.reload();
}

export interface PwaUpdate {
  readonly needRefresh: boolean;
  readonly reload: () => void;
  readonly dismiss: () => void;
}

export function usePwaUpdate(
  createClient: () => UpdateClient | null = createWorkboxClient,
  reload: () => void = reloadPage,
): PwaUpdate {
  const [needRefresh, setNeedRefresh] = useState(false);
  const controller = useRef<UpdateController | null>(null);

  // Registration happens once per mount; the factories are injection points for tests, not live inputs.
  useEffect(() => {
    const client = createClient();
    if (!client) return;
    const current = registerServiceWorker(client, {
      onNeedRefresh: () => {
        setNeedRefresh(true);
      },
      reload,
    });
    controller.current = current;
    return () => {
      current.dispose();
      controller.current = null;
    };
  }, []);

  return {
    needRefresh,
    reload: useCallback(() => controller.current?.applyUpdate(), []),
    dismiss: useCallback(() => {
      setNeedRefresh(false);
    }, []),
  };
}
