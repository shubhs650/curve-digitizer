import { beforeAll, describe, expect, it } from 'vitest';
import type { Rotation } from '@cd/core';
import type { PdfDocument, PdfEngine, RgbaImage } from './engine.ts';
import { PdfOpenError, PdfPermissionError } from './engine.ts';
import { cropPixelSize, MAX_RENDER_PIXELS } from './geometry.ts';
import { loadPdfEngine } from './load.ts';
import {
  CHART_PDF,
  chartRect,
  NO_COPY_PDF,
  OWNER_PASSWORD,
  PASSWORD,
  PASSWORD_PDF,
} from './testing/fixtures.ts';

// These run the real PDFium build (Node flavour of @embedpdf/pdfium) against the fixtures.

let engine: PdfEngine;

beforeAll(async () => {
  engine = await loadPdfEngine();
});

function withDocument<T>(bytes: Uint8Array, password: string | undefined, use: (doc: PdfDocument) => T): T {
  const doc = engine.open(bytes, password);
  try {
    return use(doc);
  } finally {
    doc.close();
  }
}

function openFailure(bytes: Uint8Array, password?: string): string {
  try {
    engine.open(bytes, password).close();
  } catch (error) {
    if (error instanceof PdfOpenError) return error.reason;
    throw error;
  }
  return 'opened';
}

/** Rec. 601 luma of pixel (x, y). */
function luma(image: RgbaImage, x: number, y: number): number {
  const i = (y * image.width + x) * 4;
  return 0.299 * (image.rgba[i] ?? 0) + 0.587 * (image.rgba[i + 1] ?? 0) + 0.114 * (image.rgba[i + 2] ?? 0);
}

describe('PdfEngine.open', () => {
  it('reads page geometry, including /Rotate, and full permissions of an unprotected PDF', () => {
    withDocument(CHART_PDF, undefined, (doc) => {
      expect(doc.pageCount).toBe(3);
      expect(doc.pages[0]?.width).toBeCloseTo(841.92, 2);
      expect(doc.pages[0]?.height).toBeCloseTo(594.96, 2);
      expect(doc.pages[0]?.rotation).toBe(0);
      // Page 3 is stored landscape and shown portrait.
      expect(doc.pages[2]?.width).toBeCloseTo(841.92, 2);
      expect(doc.pages[2]?.rotation).toBe(90);
      expect(doc.permissions).toEqual({ copy: true, print: true });
    });
  });

  it('tells a file that is not a PDF apart', () => {
    expect(openFailure(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]))).toBe('notPdf');
    expect(openFailure(CHART_PDF.subarray(0, 2000))).toBe('notPdf');
  });

  it('asks for a password, rejects a wrong one and opens with the right one (R6)', () => {
    expect(openFailure(PASSWORD_PDF)).toBe('passwordRequired');
    expect(openFailure(PASSWORD_PDF, 'open-sesam')).toBe('wrongPassword');
    withDocument(PASSWORD_PDF, PASSWORD, (doc) => {
      expect(doc.pageCount).toBe(3);
    });
  });

  it('honours a no-copy permission: thumbnails yes, crops no (R6)', () => {
    withDocument(NO_COPY_PDF, undefined, (doc) => {
      expect(doc.permissions).toEqual({ copy: false, print: true });
      expect(doc.renderThumbnail(0, 64).width).toBe(64);
      expect(() => doc.renderCrop({ pageIndex: 0, rectPt: [0, 0, 100, 100], dpi: 72, rotation: 0 })).toThrow(
        PdfPermissionError,
      );
    });
    // The owner password lifts the restriction.
    withDocument(NO_COPY_PDF, OWNER_PASSWORD, (doc) => {
      expect(doc.permissions.copy).toBe(true);
    });
  });

  it('frees the document on close and refuses to render after', () => {
    const doc = engine.open(CHART_PDF);
    doc.close();
    doc.close();
    expect(() => doc.renderThumbnail(0, 10)).toThrow(/closed/);
  });
});

describe('PdfDocument rendering', () => {
  it('renders a thumbnail as displayed, longer side = maxSide', () => {
    withDocument(CHART_PDF, undefined, (doc) => {
      const landscape = doc.renderThumbnail(0, 200);
      expect([landscape.width, landscape.height]).toEqual([200, 141]);
      expect(landscape.rgba.length).toBe(200 * 141 * 4);
      const portrait = doc.renderThumbnail(2, 200);
      expect([portrait.width, portrait.height]).toEqual([141, 200]);
      expect(() => doc.renderThumbnail(3, 200)).toThrow(RangeError);
    });
  });

  /** Centre (in pixel coordinates, ADR 25) of the strongest ink along `line` within ±5 px of `near`. */
  function inkCentre(line: (i: number) => number, near: number): number {
    let best = near;
    for (let i = Math.floor(near) - 5; i <= near + 5; i++) if (line(i) > line(best)) best = i;
    const around = [best - 1, best, best + 1];
    const weights = around.map(line);
    const total = weights.reduce((a, b) => a + b, 0);
    return around.reduce((sum, i, k) => sum + (i + 0.5) * (weights[k] ?? 0), 0) / total;
  }

  function vectorClean(
    doc: PdfDocument,
    dpi: number,
    rotation: Rotation,
    shiftPt: readonly [number, number] = [0, 0],
  ) {
    const page = doc.pages[0];
    if (page === undefined) throw new Error('missing page');
    const [x0, y0, x1, y1] = chartRect(page, 2400, 1600);
    const [dx, dy] = shiftPt;
    return doc.renderCrop({ pageIndex: 0, rectPt: [x0 + dx, y0 + dy, x1 + dx, y1 + dy], dpi, rotation });
  }

  it('crops at a DPI onto the source pixel grid', () => {
    withDocument(CHART_PDF, undefined, (doc) => {
      const crop = vectorClean(doc, 240, 0);
      expect([crop.width, crop.height]).toEqual([2400, 1600]);
      // vector-clean's plot frame is a black 2 px stroke at x = 200 and y = 110 of source.png. The printer
      // snaps the chart's position by a fraction of a point, so allow 1 px.
      const ink = (x: number, y: number) => 255 - luma(crop, x, y);
      expect(Math.abs(inkCentre((x) => ink(x, 800), 200) - 200)).toBeLessThanOrEqual(1);
      expect(Math.abs(inkCentre((y) => ink(1000, y), 110) - 110)).toBeLessThanOrEqual(1);
    });
  });

  it('places the crop rectangle exactly: moving it by n points moves the image by n·dpi/72 pixels', () => {
    withDocument(CHART_PDF, undefined, (doc) => {
      const base = vectorClean(doc, 240, 0);
      // 3 pt right = 10 px, 6 pt up = 20 px at 240 DPI.
      const moved = vectorClean(doc, 240, 0, [3, 6]);
      let worst = 0;
      for (let y = 30; y < 1590; y += 41) {
        for (let x = 5; x < 2380; x += 37)
          worst = Math.max(worst, Math.abs(luma(moved, x, y) - luma(base, x + 10, y - 20)));
      }
      // PDFium takes the matrix as single-precision floats, so anti-aliased edges may differ by a level or two.
      expect(worst).toBeLessThanOrEqual(2);
    });
  });

  it.each([90, 180, 270] as const)('turns a crop %i° clockwise', (rotation) => {
    withDocument(CHART_PDF, undefined, (doc) => {
      const upright = vectorClean(doc, 240, 0);
      const turned = vectorClean(doc, 240, rotation);
      const { width: w, height: h } = upright;
      expect([turned.width, turned.height]).toEqual(rotation === 180 ? [w, h] : [h, w]);
      // Pixel (i, j) of the upright crop lands at:
      const at = (i: number, j: number): readonly [number, number] =>
        rotation === 90 ? [h - 1 - j, i] : rotation === 180 ? [w - 1 - i, h - 1 - j] : [j, w - 1 - i];
      let samples = 0;
      let same = 0;
      for (let j = 3; j < h; j += 29) {
        for (let i = 7; i < w; i += 31) {
          const [x, y] = at(i, j);
          samples++;
          if (Math.abs(luma(turned, x, y) - luma(upright, i, j)) <= 2) same++;
        }
      }
      // Glyphs rasterize differently when turned (hinting), so the few samples on text may differ.
      expect(same / samples).toBeGreaterThan(0.99);
    });
  });

  it('crops in page space on a page with /Rotate', () => {
    withDocument(CHART_PDF, undefined, (doc) => {
      const page = doc.pages[2];
      if (page === undefined) throw new Error('missing page');
      // dark-bg (1800 × 1200 px at 0.4 pt/px) has a light 2 px plot frame at x = 190 and y = 100 on near-black.
      // Rotation 0 is relative to page space, so the chart comes back upright as it was drawn.
      const crop = doc.renderCrop({
        pageIndex: 2,
        rectPt: chartRect(page, 1800, 1200),
        dpi: 180,
        rotation: 0,
      });
      expect([crop.width, crop.height]).toEqual([1800, 1200]);
      expect(Math.abs(inkCentre((x) => luma(crop, x, 600), 190) - 190)).toBeLessThanOrEqual(1);
      expect(Math.abs(inkCentre((y) => luma(crop, 900, y), 100) - 100)).toBeLessThanOrEqual(1);
    });
  });

  it('renders a 600 DPI crop of up to 50 Mpx within 1.5 s (P3)', () => {
    withDocument(CHART_PDF, undefined, (doc) => {
      const page = doc.pages[0];
      if (page === undefined) throw new Error('missing page');
      // The largest region whose 600 DPI crop fits the budget: the page, widened to 49.9 Mpx.
      const scale = Math.sqrt(MAX_RENDER_PIXELS / 1.002 / (page.width * page.height * (600 / 72) ** 2));
      const rectPt = [0, 0, page.width * scale, page.height * scale] as const;
      const start = performance.now();
      const crop = doc.renderCrop({ pageIndex: 0, rectPt, dpi: 600, rotation: 0 });
      const elapsed = performance.now() - start;
      expect(crop.width * crop.height).toBeGreaterThan(49e6);
      expect(crop.width * crop.height).toBeLessThanOrEqual(MAX_RENDER_PIXELS);
      expect(elapsed).toBeLessThan(1500);
    });
  });

  it('refuses a crop over the pixel budget', () => {
    withDocument(CHART_PDF, undefined, (doc) => {
      const rectPt = [0, 0, 841, 594] as const;
      expect(cropPixelSize(rectPt, 900, 0).width * cropPixelSize(rectPt, 900, 0).height).toBeGreaterThan(5e7);
      expect(() => doc.renderCrop({ pageIndex: 0, rectPt, dpi: 900, rotation: 0 })).toThrow(/budget/);
    });
  });
});
