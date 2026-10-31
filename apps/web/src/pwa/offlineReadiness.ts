import { useEffect, useState } from 'react';

// ARCHITECTURE §10: the shell is precached on first load and PDFium is runtime-cached on first PDF open
// (cache name in vite.config.ts); "Ready offline" says which of the two this browser has.

export type OfflineReadiness = 'none' | 'images' | 'full';

export const PDFIUM_CACHE = 'pdfium';

export interface OfflineProbe {
  /** A service worker controls the page, so the precached shell answers when offline. */
  readonly controlled: () => boolean;
  /** Request URLs in the PDFium runtime cache. */
  readonly pdfiumCached: () => Promise<readonly string[]>;
}

export const browserProbe: OfflineProbe = {
  controlled: () => 'serviceWorker' in navigator && navigator.serviceWorker.controller !== null,
  pdfiumCached: async () => {
    if (typeof caches === 'undefined') return [];
    const cache = await caches.open(PDFIUM_CACHE);
    return (await cache.keys()).map((request) => request.url);
  },
};

export async function offlineReadiness(probe: OfflineProbe): Promise<OfflineReadiness> {
  if (!probe.controlled()) return 'none';
  const urls = await probe.pdfiumCached();
  // PDFium is its glue script plus the module; both must be cached for PDFs to open offline.
  const full = urls.some((u) => u.endsWith('.wasm')) && urls.some((u) => u.endsWith('.js'));
  return full ? 'full' : 'images';
}

/** How often to look again until fully ready; the runtime cache fills in the background after a PDF opens. */
export const RECHECK_MS = 3000;

export function useOfflineReadiness(probe: OfflineProbe = browserProbe): OfflineReadiness {
  const [readiness, setReadiness] = useState<OfflineReadiness>('none');
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      offlineReadiness(probe)
        .catch((): OfflineReadiness => 'none')
        .then((next) => {
          if (stopped) return;
          setReadiness(next);
          if (next !== 'full') timer = setTimeout(check, RECHECK_MS);
        })
        .catch(() => undefined);
    };
    check();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [probe]);
  return readiness;
}
