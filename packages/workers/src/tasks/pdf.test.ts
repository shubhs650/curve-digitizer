import { sha256Hex } from '@cd/core';
import { CHART_PDF, PASSWORD, PASSWORD_PDF } from '@cd/pdf/testing';
import { afterEach, describe, expect, it } from 'vitest';
import type { TaskContext } from '../api.ts';
import { pdfClose, pdfCrop, pdfOpen, type PdfOpenOutput, pdfThumbnail } from './pdf.ts';

const ctx: TaskContext = {
  cancelled: false,
  throwIfCancelled: () => undefined,
  progress: () => undefined,
  checkpoint: () => Promise.resolve(),
};

const blob = (bytes: Uint8Array) => new Blob([bytes.slice()], { type: 'application/pdf' });

async function open(key: string, bytes: Uint8Array, password?: string): Promise<PdfOpenOutput> {
  return pdfOpen.run({ key, file: blob(bytes), ...(password === undefined ? {} : { password }) }, ctx);
}

afterEach(async () => {
  for (const key of ['a', 'b', 'c', 'd', 'e']) await pdfClose.run({ key }, ctx);
});

describe('PDF render tasks', () => {
  it('opens a PDF from a Blob and reports its pages, permissions and SHA-256', async () => {
    const result = await open('a', CHART_PDF);
    if (result.status !== 'opened') throw new Error(result.message);
    expect(result.pages.map((p) => p.rotation)).toEqual([0, 0, 90]);
    expect(result.permissions.copy).toBe(true);
    expect(result.sha256).toBe(await sha256Hex(CHART_PDF));
  });

  it('reports password problems as results, not errors (R6)', async () => {
    expect(await open('a', PASSWORD_PDF)).toMatchObject({ status: 'failed', reason: 'passwordRequired' });
    expect(await open('a', PASSWORD_PDF, 'nope')).toMatchObject({
      status: 'failed',
      reason: 'wrongPassword',
    });
    expect(await open('a', PASSWORD_PDF, PASSWORD)).toMatchObject({ status: 'opened' });
    expect(await open('b', new Uint8Array([1, 2, 3]))).toMatchObject({ status: 'failed', reason: 'notPdf' });
  });

  it('renders thumbnails and crops of an open document, and transfers their pixels', async () => {
    await open('a', CHART_PDF);
    const thumb = await pdfThumbnail.run({ key: 'a', pageIndex: 2, maxSide: 100 }, ctx);
    expect([thumb.width, thumb.height]).toEqual([71, 100]);
    expect(pdfThumbnail.transferables?.(thumb)).toEqual([thumb.rgba.buffer]);
    const crop = await pdfCrop.run(
      { key: 'a', pageIndex: 0, rectPt: [0, 0, 72, 36], dpi: 144, rotation: 90 },
      ctx,
    );
    expect([crop.width, crop.height, crop.rgba.byteLength]).toEqual([72, 144, 72 * 144 * 4]);
  });

  it('closes documents on request and beyond the open limit', async () => {
    for (const key of ['a', 'b', 'c', 'd', 'e']) await open(key, CHART_PDF);
    // Five opened, four kept: the least recently used one was closed.
    expect(() => pdfThumbnail.run({ key: 'a', pageIndex: 0, maxSide: 10 }, ctx)).toThrow(/not open/);
    expect((await pdfThumbnail.run({ key: 'b', pageIndex: 0, maxSide: 10 }, ctx)).width).toBe(10);
    await pdfClose.run({ key: 'b' }, ctx);
    expect(() => pdfThumbnail.run({ key: 'b', pageIndex: 0, maxSide: 10 }, ctx)).toThrow(/not open/);
  });
});
