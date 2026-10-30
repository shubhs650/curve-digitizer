import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { CSP_DIRECTIVES, EMPTY_STYLE_HASH, contentSecurityPolicy, cspMetaTag } from './csp';

function directive(name: string): string[] {
  const entry = contentSecurityPolicy()
    .split(';')
    .map((part) => part.trim().split(/\s+/))
    .find(([key]) => key === name);
  if (!entry) throw new Error(`missing ${name}`);
  return entry.slice(1);
}

describe('content security policy', () => {
  it("allows network connections to 'self' only (ARCHITECTURE §10)", () => {
    expect(directive('connect-src')).toEqual(["'self'"]);
  });

  it('defaults everything to self and forbids plugins, framing targets and base hijacking', () => {
    expect(directive('default-src')).toEqual(["'self'"]);
    expect(directive('object-src')).toEqual(["'none'"]);
    expect(directive('base-uri')).toEqual(["'self'"]);
    expect(directive('form-action')).toEqual(["'none'"]);
  });

  it('runs no inline or eval script, but may compile WebAssembly for PDFium', () => {
    expect(directive('script-src')).toEqual(["'self'", "'wasm-unsafe-eval'"]);
  });

  it("allows only empty <style> elements (Griffel fills them via CSSOM), never 'unsafe-inline'", () => {
    expect(EMPTY_STYLE_HASH).toBe(`'sha256-${createHash('sha256').update('').digest('base64')}'`);
    expect(directive('style-src')).toEqual(["'self'", EMPTY_STYLE_HASH]);
    expect(contentSecurityPolicy()).not.toContain('unsafe-inline');
  });

  it('lets workers and images come from self or local blobs only', () => {
    expect(directive('worker-src')).toEqual(["'self'", 'blob:']);
    expect(directive('img-src')).toEqual(["'self'", 'blob:', 'data:']);
  });

  it('names no other origin anywhere', () => {
    expect(contentSecurityPolicy()).not.toMatch(/https?:|\*/);
  });

  it('serializes every directive exactly once', () => {
    const names = contentSecurityPolicy()
      .split(';')
      .map((part) => part.trim().split(/\s+/)[0]);
    expect(names).toEqual(Object.keys(CSP_DIRECTIVES));
  });

  it('renders a meta tag Vite can inject into the built index.html', () => {
    expect(cspMetaTag()).toEqual({
      tag: 'meta',
      attrs: { 'http-equiv': 'Content-Security-Policy', content: contentSecurityPolicy() },
      injectTo: 'head-prepend',
    });
  });
});
