import type { HtmlTagDescriptor } from 'vite';

// ARCHITECTURE §10 / PRD §6: no network after load, nothing from another origin.
// - script-src: no inline or eval script; 'wasm-unsafe-eval' only permits compiling WebAssembly (PDFium, 1.7).
// - worker-src blob: and img-src blob:/data: cover workers and decoded images built from local files.
// - style-src: Fluent's Griffel appends *empty* <style> elements and fills them through CSSOM insertRule,
//   which CSP does not inspect. Chromium still blocks the empty element unless allowed, so the policy allows
//   exactly the hash of the empty string instead of 'unsafe-inline'; any <style> with content stays blocked.
// Shipped as a <meta> tag so any static host (and `vite preview`) enforces it; config/headers.ts repeats it
// as a response header with frame-ancestors, which a meta tag cannot carry.
// base64(sha256(''))
export const EMPTY_STYLE_HASH = "'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='";

export const CSP_DIRECTIVES: Readonly<Record<string, readonly string[]>> = {
  'default-src': ["'self'"],
  'script-src': ["'self'", "'wasm-unsafe-eval'"],
  'style-src': ["'self'", EMPTY_STYLE_HASH],
  'img-src': ["'self'", 'blob:', 'data:'],
  'font-src': ["'self'"],
  'connect-src': ["'self'"],
  'worker-src': ["'self'", 'blob:'],
  'manifest-src': ["'self'"],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'none'"],
};

export function contentSecurityPolicy(): string {
  return Object.entries(CSP_DIRECTIVES)
    .map(([name, sources]) => [name, ...sources].join(' '))
    .join('; ');
}

export function cspMetaTag(): HtmlTagDescriptor {
  return {
    tag: 'meta',
    attrs: { 'http-equiv': 'Content-Security-Policy', content: contentSecurityPolicy() },
    injectTo: 'head-prepend',
  };
}
