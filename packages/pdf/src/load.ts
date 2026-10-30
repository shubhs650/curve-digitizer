import { PdfEngine } from './engine.ts';

/** PDFium could not be fetched or compiled; the app carries on in image-only mode (R5). */
export class PdfiumLoadError extends Error {
  override readonly name = 'PdfiumLoadError';
}

/** Emscripten module options we pass; tests use `wasmBinary` to feed a broken module. */
export interface PdfiumOverrides {
  readonly wasmBinary?: ArrayBuffer;
}

let loading: Promise<PdfEngine> | null = null;

/**
 * Loads PDFium once per realm. A failed load is not cached, so a later PDF open tries again.
 * @param overrides Emscripten module options; tests pass none and the glue finds `pdfium.wasm` next to itself.
 * @throws PdfiumLoadError
 */
export function loadPdfEngine(overrides: PdfiumOverrides = {}): Promise<PdfEngine> {
  loading ??= (async () => {
    try {
      const { init } = await import('./pdfium.ts');
      const pdfium = await init(overrides);
      pdfium.PDFiumExt_Init();
      return new PdfEngine(pdfium);
    } catch (cause) {
      loading = null;
      throw new PdfiumLoadError('PDF support could not be loaded.', { cause });
    }
  })();
  return loading;
}
