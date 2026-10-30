import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { cspMetaTag } from './config/csp.ts';
import { CROSS_ORIGIN_ISOLATION_HEADERS, hostHeadersFile } from './config/headers.ts';
import { manifest } from './config/manifest.ts';

const pkg = JSON.parse(readFileSync(new URL('package.json', import.meta.url), 'utf8')) as { version: string };

// Build only: the dev server needs inline scripts (React refresh) and a websocket (HMR) that the CSP forbids.
const contentSecurityPolicy: Plugin = {
  name: 'cd:content-security-policy',
  apply: 'build',
  transformIndexHtml: () => [cspMetaTag()],
};

const hostHeaders: Plugin = {
  name: 'cd:host-headers',
  apply: 'build',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: '_headers', source: hostHeadersFile() });
  },
};

export default defineConfig({
  plugins: [
    react(),
    contentSecurityPolicy,
    hostHeaders,
    VitePWA({
      // The app shows its own "New version available" prompt (src/pwa) through workbox-window.
      registerType: 'prompt',
      injectRegister: false,
      manifest,
      workbox: {
        // Core-first (ARCHITECTURE §10): precache the app shell and its chunks so a reload works offline.
        globPatterns: ['**/*.{html,js,css,wasm,svg,png,webmanifest,woff2}'],
        // PDFium is runtime-cached on first PDF open instead, so first load stays small.
        globIgnores: ['**/*pdfium*'],
        runtimeCaching: [
          {
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.includes('pdfium'),
            handler: 'CacheFirst',
            options: { cacheName: 'pdfium' },
          },
        ],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        // A first install controls the open page at once, so going offline right after the first load works.
        clientsClaim: true,
        skipWaiting: false,
      },
    }),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    target: 'es2022',
  },
  server: {
    port: 5173,
    strictPort: true,
    headers: CROSS_ORIGIN_ISOLATION_HEADERS,
  },
  preview: {
    port: 4173,
    strictPort: true,
    headers: CROSS_ORIGIN_ISOLATION_HEADERS,
  },
});
