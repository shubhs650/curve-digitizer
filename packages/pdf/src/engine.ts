import type { RectPt, Rotation } from '@cd/core';
import type { WrappedPdfiumModule } from '@embedpdf/pdfium';
import type { PageGeometry, PixelSize } from './geometry.ts';
import { cropPixelSize, displaySize, MAX_RENDER_PIXELS, renderMatrix } from './geometry.ts';

// PDFium constants (fpdfview.h).
const FPDF_ERR_FILE = 2;
const FPDF_ERR_FORMAT = 3;
const FPDF_ERR_PASSWORD = 4;
const FPDF_ERR_SECURITY = 5;
const FPDFBITMAP_BGRA = 4;
const FPDF_ANNOT = 0x01;
const FPDF_REVERSE_BYTE_ORDER = 0x10;
const OPAQUE_WHITE = 0xffffffff;
/** Permission bit 5 (ISO 32000-1 Table 22): copy or otherwise extract text and graphics. */
const PERMISSION_COPY = 0x10;
const PERMISSION_PRINT = 0x04;

export type PdfOpenFailure = 'passwordRequired' | 'wrongPassword' | 'notPdf' | 'unsupportedSecurity';

/** Why a PDF could not be opened; `reason` drives the message the user sees (R6). */
export class PdfOpenError extends Error {
  override readonly name = 'PdfOpenError';
  readonly reason: PdfOpenFailure;

  constructor(reason: PdfOpenFailure, message: string) {
    super(message);
    this.reason = reason;
  }
}

/** The document's permissions forbid what was asked (R6). */
export class PdfPermissionError extends Error {
  override readonly name = 'PdfPermissionError';
}

export interface PdfPermissions {
  /** Copying or extracting graphics. A crop is an extraction, so it needs this (like Acrobat's snapshot tool). */
  readonly copy: boolean;
  readonly print: boolean;
}

/** An RGBA image (straight alpha, 4 bytes per pixel, rows top to bottom) in its own buffer, ready to transfer. */
export interface RgbaImage extends PixelSize {
  readonly rgba: Uint8Array<ArrayBuffer>;
}

export interface CropRequest {
  /** 0-based. */
  readonly pageIndex: number;
  readonly rectPt: RectPt;
  readonly dpi: number;
  readonly rotation: Rotation;
}

type Pdfium = WrappedPdfiumModule;

/**
 * The Emscripten runtime calls we make. @embedpdf/pdfium types its runtime against @types/emscripten, which
 * this repo does not install, so the module's own typing leaves these out.
 */
interface Runtime {
  /** Replaced when the heap grows: read it after any call that may allocate. */
  readonly HEAPU8: Uint8Array;
  getValue(ptr: number, type: 'float'): number;
  setValue(ptr: number, value: number, type: 'float'): void;
  readonly wasmExports: { malloc(size: number): number; free(ptr: number): void };
}

const runtime = (m: Pdfium) => m.pdfium as unknown as Runtime;

function toRotation(quarterTurns: number): Rotation {
  return ((((quarterTurns % 4) + 4) % 4) * 90) as Rotation;
}

/** One PDFium instance. Not thread-safe: use from one worker. */
export class PdfEngine {
  readonly #pdfium: Pdfium;

  constructor(pdfium: Pdfium) {
    this.#pdfium = pdfium;
  }

  /**
   * Opens a PDF from its bytes, which are copied into PDFium's heap until `close()`.
   * @throws PdfOpenError for a missing or wrong password, a file that is not a PDF, or unsupported encryption.
   */
  open(bytes: Uint8Array, password?: string): PdfDocument {
    const m = this.#pdfium;
    const ptr = malloc(m, bytes.length);
    runtime(m).HEAPU8.set(bytes, ptr);
    const doc = m.FPDF_LoadMemDocument(ptr, bytes.length, password ?? '');
    if (doc === 0) {
      const error = m.FPDF_GetLastError();
      runtime(m).wasmExports.free(ptr);
      throw openError(error, password !== undefined && password !== '');
    }
    return new PdfDocument(m, doc, ptr);
  }
}

function openError(code: number, triedPassword: boolean): PdfOpenError {
  switch (code) {
    case FPDF_ERR_PASSWORD:
      return triedPassword
        ? new PdfOpenError('wrongPassword', 'The password is not correct.')
        : new PdfOpenError('passwordRequired', 'This PDF is protected by a password.');
    case FPDF_ERR_SECURITY:
      return new PdfOpenError(
        'unsupportedSecurity',
        'This PDF uses a security handler that is not supported.',
      );
    case FPDF_ERR_FILE:
    case FPDF_ERR_FORMAT:
    default:
      return new PdfOpenError('notPdf', 'This file is not a PDF or is damaged.');
  }
}

function malloc(m: Pdfium, size: number): number {
  const ptr = runtime(m).wasmExports.malloc(size);
  if (ptr === 0) throw new RangeError(`PDFium could not allocate ${String(size)} bytes`);
  return ptr;
}

export class PdfDocument {
  readonly pages: readonly PageGeometry[];
  readonly permissions: PdfPermissions;
  readonly #m: Pdfium;
  readonly #doc: number;
  readonly #dataPtr: number;
  #closed = false;

  /** @internal Created by `PdfEngine.open`. */
  constructor(m: Pdfium, doc: number, dataPtr: number) {
    this.#m = m;
    this.#doc = doc;
    this.#dataPtr = dataPtr;
    const rt = runtime(m);
    const count = m.FPDF_GetPageCount(doc);
    const size = malloc(m, 8);
    try {
      this.pages = Array.from({ length: count }, (_, i) => {
        // "Normalized" is the size before /Rotate (page space).
        if (!m.EPDF_GetPageSizeByIndexNormalized(doc, i, size))
          throw new PdfOpenError('notPdf', `Page ${String(i + 1)} is damaged.`);
        return {
          width: rt.getValue(size, 'float'),
          height: rt.getValue(size + 4, 'float'),
          rotation: toRotation(m.EPDF_GetPageRotationByIndex(doc, i)),
        };
      });
    } finally {
      rt.wasmExports.free(size);
    }
    // Unencrypted documents and owner-password opens report all bits set.
    const bits = m.FPDF_GetDocPermissions(doc) >>> 0;
    this.permissions = { copy: (bits & PERMISSION_COPY) !== 0, print: (bits & PERMISSION_PRINT) !== 0 };
  }

  get pageCount(): number {
    return this.pages.length;
  }

  /** The whole page as displayed, scaled so its longer side is `maxSide` pixels. Viewing needs no permission. */
  renderThumbnail(pageIndex: number, maxSide: number): RgbaImage {
    const page = this.#page(pageIndex);
    const shown = displaySize(page);
    const dpi = (72 * maxSide) / Math.max(shown.width, shown.height);
    return this.#render({ pageIndex, rectPt: [0, 0, page.width, page.height], dpi, rotation: page.rotation });
  }

  /**
   * Renders `rectPt` of a page at `dpi`, turned clockwise by `rotation`, on white.
   * @throws PdfPermissionError when the document forbids copying graphics.
   * @throws RangeError over the pixel budget; cap the DPI with `capDpi` first.
   */
  renderCrop(request: CropRequest): RgbaImage {
    if (!this.permissions.copy) {
      throw new PdfPermissionError(
        "This PDF's permissions do not allow copying its content, so it cannot be cropped.",
      );
    }
    return this.#render(request);
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#m.FPDF_CloseDocument(this.#doc);
    runtime(this.#m).wasmExports.free(this.#dataPtr);
  }

  #page(pageIndex: number): PageGeometry {
    if (this.#closed) throw new Error('The PDF is closed');
    const page = this.pages[pageIndex];
    if (page === undefined)
      throw new RangeError(`No page ${String(pageIndex + 1)} (the PDF has ${String(this.pageCount)})`);
    return page;
  }

  #render({ pageIndex, rectPt, dpi, rotation }: CropRequest): RgbaImage {
    const geometry = this.#page(pageIndex);
    const { width, height } = cropPixelSize(rectPt, dpi, rotation);
    if (width * height > MAX_RENDER_PIXELS) {
      throw new RangeError(
        `A ${String(width)} × ${String(height)} px crop exceeds the ${String(MAX_RENDER_PIXELS)} px budget`,
      );
    }
    const m = this.#m;
    const rt = runtime(m);
    const bytes = width * height * 4;
    const buffer = malloc(m, bytes);
    // FS_MATRIX (6 floats) then FS_RECTF clip (left, top, right, bottom).
    const args = malloc(m, 40);
    let bitmap = 0;
    let page = 0;
    try {
      bitmap = m.FPDFBitmap_CreateEx(width, height, FPDFBITMAP_BGRA, buffer, width * 4);
      if (bitmap === 0) throw new RangeError('PDFium could not create the bitmap');
      m.FPDFBitmap_FillRect(bitmap, 0, 0, width, height, OPAQUE_WHITE);
      page = m.FPDF_LoadPage(this.#doc, pageIndex);
      if (page === 0) throw new Error(`Page ${String(pageIndex + 1)} could not be loaded`);
      const values = [...renderMatrix(geometry, rectPt, dpi, rotation), 0, 0, width, height];
      values.forEach((v, i) => {
        rt.setValue(args + 4 * i, v, 'float');
      });
      m.FPDF_RenderPageBitmapWithMatrix(bitmap, page, args, args + 24, FPDF_ANNOT | FPDF_REVERSE_BYTE_ORDER);
      return { width, height, rgba: rt.HEAPU8.slice(buffer, buffer + bytes) };
    } finally {
      if (page !== 0) m.FPDF_ClosePage(page);
      if (bitmap !== 0) m.FPDFBitmap_Destroy(bitmap);
      rt.wasmExports.free(args);
      rt.wasmExports.free(buffer);
    }
  }
}
