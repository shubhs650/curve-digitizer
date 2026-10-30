import type { PdfOpenOutput, RgbaImage } from '@cd/workers';
import { renderWorker } from './renderWorker';

/**
 * PDFium behind the render worker. Documents are named by the project's source id; the PDF bytes and any
 * password stay in the worker. The workspace takes this as a dependency so tests can fake it.
 */
export interface PdfBackend {
  open(key: string, file: Blob, password?: string): Promise<PdfOpenOutput>;
  thumbnail(key: string, pageIndex: number, maxSide: number): Promise<RgbaImage>;
  close(key: string): Promise<void>;
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
  close: (key) => done(renderWorker().run('pdfClose', { key })),
};
