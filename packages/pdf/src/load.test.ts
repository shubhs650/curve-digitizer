import { describe, expect, it } from 'vitest';
import { PdfEngine } from './engine.ts';
import { loadPdfEngine, PdfiumLoadError } from './load.ts';

describe('loadPdfEngine', () => {
  it('reports a PDFium that cannot be compiled, then loads on a later attempt (R5)', async () => {
    const broken = loadPdfEngine({ wasmBinary: new Uint8Array([0, 0x61, 0x73, 0x6d, 9, 9, 9, 9]).buffer });
    await expect(broken).rejects.toBeInstanceOf(PdfiumLoadError);
    const engine = await loadPdfEngine();
    expect(engine).toBeInstanceOf(PdfEngine);
    expect(await loadPdfEngine()).toBe(engine);
  });
});
