import { sha256Hex } from '@cd/core';
import {
  type CropRequest,
  loadPdfEngine,
  type PageGeometry,
  type PdfDocument,
  PdfiumLoadError,
  PdfOpenError,
  type PdfOpenFailure,
  type PdfPermissions,
  type RgbaImage,
} from '@cd/pdf';
import type { Task } from '../api.ts';

// PDF tasks of the render worker (ARCHITECTURE §7). Open documents live here, keyed by the caller (the
// project's source id), so the PDF bytes and any password never come back to the main thread.

/** Open documents kept in PDFium, least recently used first; each holds a copy of its file in the heap. */
const MAX_OPEN_DOCUMENTS = 4;
const documents = new Map<string, PdfDocument>();

function keep(key: string, doc: PdfDocument): void {
  documents.get(key)?.close();
  documents.delete(key);
  documents.set(key, doc);
  for (const [oldest, stale] of documents) {
    if (documents.size <= MAX_OPEN_DOCUMENTS) break;
    stale.close();
    documents.delete(oldest);
  }
}

function opened(key: string): PdfDocument {
  const doc = documents.get(key);
  if (doc === undefined) throw new Error(`The PDF "${key}" is not open`);
  // Re-insert to mark as most recently used.
  documents.delete(key);
  documents.set(key, doc);
  return doc;
}

export interface PdfOpenInput {
  /** Names the document in later calls; the app uses the source id. */
  readonly key: string;
  /** The PDF; an OPFS-backed `File` is read here, in the worker, not on the main thread. */
  readonly file: Blob;
  /** Used only in memory, never stored. */
  readonly password?: string;
}

export type PdfOpenOutput =
  | {
      readonly status: 'opened';
      readonly pages: readonly PageGeometry[];
      readonly permissions: PdfPermissions;
      /** Lowercase hex SHA-256 of the file, for `SourceFile.sha256`. */
      readonly sha256: string;
    }
  | {
      readonly status: 'failed';
      /** `pdfiumUnavailable`: PDFium could not be loaded; the app falls back to image-only mode (R5). */
      readonly reason: PdfOpenFailure | 'pdfiumUnavailable';
      readonly message: string;
    };

/** Loads PDFium on first use (P2), then opens a PDF and keeps it open under `key`. */
export const pdfOpen: Task<PdfOpenInput, PdfOpenOutput> = {
  async run({ key, file, password }, ctx) {
    let engine;
    try {
      engine = await loadPdfEngine();
    } catch (error) {
      if (!(error instanceof PdfiumLoadError)) throw error;
      return { status: 'failed', reason: 'pdfiumUnavailable', message: error.message };
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    await ctx.checkpoint();
    let doc: PdfDocument;
    try {
      doc = engine.open(bytes, password);
    } catch (error) {
      if (!(error instanceof PdfOpenError)) throw error;
      return { status: 'failed', reason: error.reason, message: error.message };
    }
    try {
      const sha256 = await sha256Hex(bytes);
      ctx.throwIfCancelled();
      keep(key, doc);
      return { status: 'opened', pages: doc.pages, permissions: doc.permissions, sha256 };
    } catch (error) {
      doc.close();
      throw error;
    }
  },
};

export interface PdfThumbnailInput {
  readonly key: string;
  /** 0-based. */
  readonly pageIndex: number;
  /** Pixels on the longer side. */
  readonly maxSide: number;
}

const transferRgba = (image: RgbaImage): readonly Transferable[] => [image.rgba.buffer];

export const pdfThumbnail: Task<PdfThumbnailInput, RgbaImage> = {
  run: ({ key, pageIndex, maxSide }) => opened(key).renderThumbnail(pageIndex, maxSide),
  transferables: transferRgba,
};

export interface PdfCropInput extends CropRequest {
  readonly key: string;
}

/** Renders a crop; the caller caps the DPI with `capDpi` first (R7) and tells the user. */
export const pdfCrop: Task<PdfCropInput, RgbaImage> = {
  run: ({ key, ...request }) => opened(key).renderCrop(request),
  transferables: transferRgba,
};

export interface PdfCropPngOutput {
  /** The crop as a PNG, ready to store as a graph image; transferred out. */
  readonly png: ArrayBuffer;
  readonly width: number;
  readonly height: number;
  /** Time PDFium spent rendering, without the PNG encode (P3). */
  readonly renderMs: number;
}

/**
 * Renders a crop and encodes it as PNG in the worker, so a crop of up to 50 Mpx never crosses to the main
 * thread as raw pixels.
 */
export const pdfCropPng: Task<PdfCropInput, PdfCropPngOutput> = {
  async run({ key, ...request }, ctx) {
    const start = performance.now();
    const { width, height, rgba } = opened(key).renderCrop(request);
    const renderMs = performance.now() - start;
    ctx.throwIfCancelled();
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    if (context === null) throw new Error('OffscreenCanvas 2D context unavailable');
    context.putImageData(new ImageData(new Uint8ClampedArray(rgba.buffer), width, height), 0, 0);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    ctx.throwIfCancelled();
    return { png: await blob.arrayBuffer(), width, height, renderMs };
  },
  transferables: (output) => [output.png],
};

export interface PdfCloseInput {
  readonly key: string;
}

/** Frees a document; closing one that is not open does nothing. */
export const pdfClose: Task<PdfCloseInput, void> = {
  run({ key }) {
    documents.get(key)?.close();
    documents.delete(key);
  },
};
