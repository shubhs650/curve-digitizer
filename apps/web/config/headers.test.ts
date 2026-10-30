import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy } from './csp';
import { CROSS_ORIGIN_ISOLATION_HEADERS, hostHeadersFile } from './headers';

describe('response headers', () => {
  it('make every document cross-origin isolated so workers can share a cancel flag (ARCHITECTURE §7)', () => {
    expect(CROSS_ORIGIN_ISOLATION_HEADERS).toEqual({
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    });
  });

  it('renders a Cloudflare Pages _headers file applying isolation and the CSP to every path', () => {
    const lines = hostHeadersFile().trimEnd().split('\n');
    expect(lines[0]).toBe('/*');
    expect(lines.slice(1)).toEqual([
      '  Cross-Origin-Opener-Policy: same-origin',
      '  Cross-Origin-Embedder-Policy: require-corp',
      `  Content-Security-Policy: ${contentSecurityPolicy()}; frame-ancestors 'none'`,
      '  X-Content-Type-Options: nosniff',
    ]);
  });
});
