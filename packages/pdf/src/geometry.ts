import type { RectPt, Rotation } from '@cd/core';

// Coordinate frames (ADR 28):
// - page space: PDF points on the page as stored, before its /Rotate; origin at the page box's bottom-left
//   corner, y up. `PdfCropSource.rectPt` is `[x0, y0, x1, y1]` in this frame.
// - display space: points on the page as a viewer shows it (after /Rotate); origin top-left, y down. This is
//   the frame PDFium's FPDF_RenderPageBitmapWithMatrix maps from.
// - crop pixels: the rendered Graph image, `dpi / 72` pixels per point, turned clockwise by the crop's
//   `rotation`; origin top-left, y down (ADR 25).

/** Largest crop the renderer produces (R7): 50 Mpx, about 200 MB of RGBA. */
export const MAX_RENDER_PIXELS = 50_000_000;

/** 2-D affine map in PDF's `[a b c d e f]` order: x' = a·x + c·y + e, y' = b·x + d·y + f. */
export type Affine = readonly [number, number, number, number, number, number];

/** A page's size in page space (points, before /Rotate) and its /Rotate. */
export interface PageGeometry {
  readonly width: number;
  readonly height: number;
  readonly rotation: Rotation;
}

export interface PixelSize {
  readonly width: number;
  readonly height: number;
}

/** `then ∘ first`: applies `first`, then `then`. */
export function composeAffine(first: Affine, then: Affine): Affine {
  const [a1, b1, c1, d1, e1, f1] = first;
  const [a2, b2, c2, d2, e2, f2] = then;
  return [
    a2 * a1 + c2 * b1,
    b2 * a1 + d2 * b1,
    a2 * c1 + c2 * d1,
    b2 * c1 + d2 * d1,
    a2 * e1 + c2 * f1 + e2,
    b2 * e1 + d2 * f1 + f2,
  ];
}

/** @throws RangeError when the map is singular. */
export function invertAffine(m: Affine): Affine {
  const [a, b, c, d, e, f] = m;
  const det = a * d - b * c;
  if (det === 0) throw new RangeError('Affine map is not invertible');
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
}

export function applyAffine(m: Affine, x: number, y: number): readonly [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

const quarterTurns = (r: Rotation) => r / 90;

/** The page's size as displayed, in points. */
export function displaySize(page: PageGeometry): PixelSize {
  return quarterTurns(page.rotation) % 2 === 0
    ? { width: page.width, height: page.height }
    : { width: page.height, height: page.width };
}

/** Page space → display space. /Rotate turns the page clockwise for display. */
export function pageToDisplay(page: PageGeometry): Affine {
  const { width: w, height: h } = page;
  switch (page.rotation) {
    case 0:
      return [1, 0, 0, -1, 0, h];
    case 90:
      return [0, 1, 1, 0, 0, 0];
    case 180:
      return [-1, 0, 0, 1, w, 0];
    case 270:
      return [0, -1, -1, 0, h, w];
  }
}

function checkRect(rect: RectPt): void {
  const [x0, y0, x1, y1] = rect;
  if (!(x1 > x0 && y1 > y0) || ![x0, y0, x1, y1].every(Number.isFinite)) {
    throw new RangeError(`Crop rectangle [${rect.join(', ')}] is empty or not finite`);
  }
}

function checkDpi(dpi: number): void {
  if (!(dpi > 0) || !Number.isFinite(dpi)) throw new RangeError(`DPI must be positive, got ${String(dpi)}`);
}

/**
 * Page space → crop pixels: s = dpi / 72, (u, v) ↦ (s·(u − x0), s·(y1 − v)), then the w·s × h·s image is
 * turned clockwise by `rotation`. Uses exact (unrounded) sizes so pixel ↔ point stays a pure scale.
 */
export function pageToCrop(rect: RectPt, dpi: number, rotation: Rotation): Affine {
  checkRect(rect);
  checkDpi(dpi);
  const [x0, y0, x1, y1] = rect;
  const s = dpi / 72;
  const wPx = (x1 - x0) * s;
  const hPx = (y1 - y0) * s;
  const upright: Affine = [s, 0, 0, -s, -s * x0, s * y1];
  switch (rotation) {
    case 0:
      return upright;
    case 90:
      return composeAffine(upright, [0, 1, -1, 0, hPx, 0]);
    case 180:
      return composeAffine(upright, [-1, 0, 0, -1, wPx, hPx]);
    case 270:
      return composeAffine(upright, [0, -1, 1, 0, 0, wPx]);
  }
}

/** The matrix FPDF_RenderPageBitmapWithMatrix needs to draw `rect` of `page` into a crop bitmap. */
export function renderMatrix(page: PageGeometry, rect: RectPt, dpi: number, rotation: Rotation): Affine {
  return composeAffine(invertAffine(pageToDisplay(page)), pageToCrop(rect, dpi, rotation));
}

/** Bitmap size of a crop: each side is round(points · dpi / 72), at least 1, swapped for 90° and 270°. */
export function cropPixelSize(rect: RectPt, dpi: number, rotation: Rotation): PixelSize {
  checkRect(rect);
  checkDpi(dpi);
  const s = dpi / 72;
  const w = Math.max(1, Math.round((rect[2] - rect[0]) * s));
  const h = Math.max(1, Math.round((rect[3] - rect[1]) * s));
  return quarterTurns(rotation) % 2 === 0 ? { width: w, height: h } : { width: h, height: w };
}

export interface CappedDpi {
  /** The DPI to render at: the requested one, or the largest whole DPI within the budget. */
  readonly dpi: number;
  readonly capped: boolean;
}

/**
 * Keeps a crop within the pixel budget (R7). Over budget, returns the largest whole DPI whose crop fits:
 * 72·√(max / area) rounded down, then stepped down while rounding of the sides still overshoots.
 */
export function capDpi(rect: RectPt, dpi: number, maxPixels = MAX_RENDER_PIXELS): CappedDpi {
  const pixels = (d: number) => {
    const { width, height } = cropPixelSize(rect, d, 0);
    return width * height;
  };
  if (pixels(dpi) <= maxPixels) return { dpi, capped: false };
  const area = (rect[2] - rect[0]) * (rect[3] - rect[1]);
  let capped = Math.floor(72 * Math.sqrt(maxPixels / area));
  while (capped > 1 && pixels(capped) > maxPixels) capped -= 1;
  return { dpi: Math.max(1, capped), capped: true };
}
