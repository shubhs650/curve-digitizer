import { contentSecurityPolicy } from './csp.ts';

// ARCHITECTURE §7: workers cancel through a shared Int32Array, and SharedArrayBuffer only exists on
// cross-origin isolated pages. Every asset is same-origin, so require-corp blocks nothing.
export const CROSS_ORIGIN_ISOLATION_HEADERS: Readonly<Record<string, string>> = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

// Vite names every file under /assets by its content hash, so a cached copy never goes stale. Everything else
// (index.html, sw.js, the manifest) keeps Pages' default of revalidating on each load, so updates are found.
const IMMUTABLE_ASSETS = '/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n';

/**
 * Cloudflare Pages `_headers` file, emitted into dist by vite.config.ts. The CSP repeats the <meta> policy
 * (both apply) and adds frame-ancestors, which a meta tag cannot carry.
 */
export function hostHeadersFile(): string {
  const headers: Record<string, string> = {
    ...CROSS_ORIGIN_ISOLATION_HEADERS,
    'Content-Security-Policy': `${contentSecurityPolicy()}; frame-ancestors 'none'`,
    'X-Content-Type-Options': 'nosniff',
  };
  return `/*\n${Object.entries(headers)
    .map(([name, value]) => `  ${name}: ${value}\n`)
    .join('')}${IMMUTABLE_ASSETS}`;
}
