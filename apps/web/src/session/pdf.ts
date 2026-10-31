import type { PdfCropInput, PdfOpenOutput, RgbaImage } from '@cd/workers';
import { renderWorker } from './renderWorker';

/**
 * PDFium behind the render worker. Documents are named by the project's source id; the PDF bytes and any
 * password stay in the worker. The workspace takes this as a dependency so tests can fake it.
 */
export interface PdfBackend {
  open(key: string, file: Blob, password?: string): Promise<PdfOpenOutput>;
  thumbnail(key: string, pageIndex: number, maxSide: number): Promise<RgbaImage>;
  /** A crop as PNG; the DPI must already be capped (R7). */
  cropPng(request: PdfCropInput): Promise<PdfCropPng>;
  close(key: string): Promise<void>;
}

export interface PdfCropPng {
  readonly png: Uint8Array;
  readonly width: number;
  readonly height: number;
  /** PDFium's render time alone (P3). */
  readonly renderMs: number;
}

async function done<T>(outcome: Promise<{ status: 'done'; value: T } | { status: 'cancelled' }>): Promise<T> {
  const result = await outcome;
  if (result.status !== 'done') throw new Error('Cancelled');
  return result.value;
}

export const workerPdfBackend: PdfBackend = {
  open: (key, file, password) =>
    done(renderWorker().run('pdfOpen', { key, file, ...(password === undefined ? {} : { password }) })),
  thumbnail: (key, pageIndex, maxSide) =>
    done(renderWorker().run('pdfThumbnail', { key, pageIndex, maxSide })),
  cropPng: async (request) => {
    const { png, ...rest } = await done(renderWorker().run('pdfCropPng', request));
    return { png: new Uint8Array(png), ...rest };
  },
  close: (key) => done(renderWorker().run('pdfClose', { key })),
};
