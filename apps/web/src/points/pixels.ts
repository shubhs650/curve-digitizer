import type { Vec2 } from '@cd/core';
import type { Raster } from '@cd/image';
import { MAX_STROKE_HALF_WIDTH_PX, type SnapResult, snapToCurve } from '@cd/trace';

/** Reads image pixels `[x0, x0 + width) × [y0, y0 + height)` clipped to the image, with where the clip starts. */
export type PixelSource = (
  x0: number,
  y0: number,
  width: number,
  height: number,
) => { readonly raster: Raster; readonly origin: Vec2 } | null;

/**
 * Pixels of a decoded graph image. A snap reads a window of about 45 × 45 px, so it stays far inside the
 * main thread's budget; `willReadFrequently` keeps the scratch canvas on the CPU so the read is not a GPU
 * round trip.
 */
export function bitmapPixels(bitmap: ImageBitmap): PixelSource {
  return (x0, y0, width, height) => {
    const left = Math.max(0, Math.floor(x0));
    const top = Math.max(0, Math.floor(y0));
    const w = Math.min(bitmap.width, Math.floor(x0) + width) - left;
    const h = Math.min(bitmap.height, Math.floor(y0) + height) - top;
    if (w <= 0 || h <= 0) return null;
    const ctx = new OffscreenCanvas(w, h).getContext('2d', { willReadFrequently: true });
    if (ctx === null) return null;
    ctx.drawImage(bitmap, left, top, w, h, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    return { raster: { width: w, height: h, channels: 4, data }, origin: [left, top] };
  };
}

/** Magnetic snap of `click` (image px) within `radiusPx`, reading only the pixels it needs. */
export function snapPoint(pixels: PixelSource, click: Vec2, radiusPx: number): SnapResult | null {
  const reach = Math.ceil(radiusPx + 2 * MAX_STROKE_HALF_WIDTH_PX + 2);
  const window = pixels(
    Math.floor(click[0]) - reach,
    Math.floor(click[1]) - reach,
    2 * reach + 1,
    2 * reach + 1,
  );
  return window === null ? null : snapToCurve(window.raster, click, radiusPx, window.origin);
}
