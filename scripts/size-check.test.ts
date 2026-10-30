import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BUDGETS, checkBudgets, classify, formatReport, measure } from './size-check.ts';

describe('classify', () => {
  it('puts PDFium glue and wasm in the pdfium bucket', () => {
    expect(classify('assets/pdfium-a1b2c3.wasm')).toBe('pdfium');
    expect(classify('assets/embedpdf-pdfium-x.js')).toBe('pdfium');
  });

  it('puts shipped code, styles, markup and fonts in the core bucket', () => {
    for (const file of ['index.html', 'assets/index-abc.js', 'assets/a.css', 'f/x.woff2', 'sw.js']) {
      expect(classify(file)).toBe('core');
    }
  });

  it('ignores source maps and non-code assets', () => {
    expect(classify('assets/index-abc.js.map')).toBe('ignored');
    expect(classify('samples/vector-clean/source.png')).toBe('ignored');
  });
});

describe('measure and checkBudgets', () => {
  let dist: string;

  beforeEach(() => {
    dist = mkdtempSync(join(tmpdir(), 'size-check-'));
    mkdirSync(join(dist, 'assets'));
  });

  afterEach(() => {
    rmSync(dist, { recursive: true, force: true });
  });

  it('sums gzip size for core and raw size for pdfium', () => {
    writeFileSync(join(dist, 'index.html'), '<!doctype html>'.repeat(100));
    writeFileSync(join(dist, 'assets', 'pdfium-1.wasm'), Buffer.alloc(1000, 7));
    writeFileSync(join(dist, 'assets', 'index.js.map'), Buffer.alloc(5000, 1));

    const totals = measure(dist);

    expect(totals.core.files).toBe(1);
    expect(totals.core.bytes).toBeGreaterThan(0);
    expect(totals.core.bytes).toBeLessThan(1500);
    expect(totals.pdfium).toEqual({ files: 1, bytes: 1000 });
  });

  it('passes when every bucket is within budget', () => {
    const results = checkBudgets({ core: { files: 1, bytes: 10 }, pdfium: { files: 0, bytes: 0 } });
    expect(results.every((r) => r.ok)).toBe(true);
  });

  it('fails a bucket that exceeds its budget', () => {
    const over = BUDGETS.core.maxBytes + 1;
    const results = checkBudgets({ core: { files: 3, bytes: over }, pdfium: { files: 0, bytes: 0 } });
    expect(results.find((r) => r.bucket === 'core')?.ok).toBe(false);
    expect(formatReport(results)).toMatch(/core.*OVER/);
  });

  it('refuses to report on a missing build', () => {
    expect(() => measure(join(dist, 'nope'))).toThrow(/run the build first/);
  });
});
