import { contentSecurityPolicy } from './csp.ts';

// ARCHITECTURE §7: workers cancel through a shared Int32Array, and SharedArrayBuffer only exists on
// cross-origin isolated pages. Every asset is same-origin, so require-corp blocks nothing.
export const CROSS_ORIGIN_ISOLATION_HEADERS: Readonly<Record<string, string>> = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

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
    .join('')}`;
}
