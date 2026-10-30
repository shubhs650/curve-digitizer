/** 8-bit pixels, rows top to bottom, no padding. Pixel (i, j) has its centre at (i + 0.5, j + 0.5) (ADR 25). */
export interface Raster {
  readonly width: number;
  readonly height: number;
  /** 1 = grey, 3 = RGB, 4 = RGBA (alpha ignored: graph images are opaque). */
  readonly channels: 1 | 3 | 4;
  readonly data: Uint8Array | Uint8ClampedArray;
}

/** A single-channel float image, same layout as `Raster`. */
export interface FloatImage {
  readonly width: number;
  readonly height: number;
  readonly data: Float32Array;
}

/** A 0/1 image, same layout as `Raster`. */
export interface Mask {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}

/** The pixel rectangle `[x0, y0)`–`[x0 + width, y0 + height)` of `raster`, clamped to its bounds. */
export function cropRaster(raster: Raster, x0: number, y0: number, width: number, height: number): Raster {
  const left = Math.max(0, Math.min(raster.width, Math.floor(x0)));
  const top = Math.max(0, Math.min(raster.height, Math.floor(y0)));
  const right = Math.max(left, Math.min(raster.width, Math.floor(x0) + width));
  const bottom = Math.max(top, Math.min(raster.height, Math.floor(y0) + height));
  const w = right - left;
  const h = bottom - top;
  const { channels } = raster;
  const data = new Uint8Array(w * h * channels);
  for (let y = 0; y < h; y++) {
    const from = ((top + y) * raster.width + left) * channels;
    data.set(raster.data.subarray(from, from + w * channels), y * w * channels);
  }
  return { width: w, height: h, channels, data };
}

/**
 * Darkness of each pixel, 1 − Y/255 with Rec. 601 luma Y = 0.299 R + 0.587 G + 0.114 B: 0 on white paper, 1 on
 * black ink. Curves are dark strokes on light paper in every M1 sample; dark backgrounds are inverted by the
 * pre-processing stack (task 2.2) before anything reads this.
 */
export function darkness(raster: Raster): FloatImage {
  const { width, height, channels, data } = raster;
  const out = new Float32Array(width * height);
  for (let i = 0; i < out.length; i++) {
    const k = i * channels;
    const luma =
      channels === 1
        ? (data[k] ?? 0)
        : 0.299 * (data[k] ?? 0) + 0.587 * (data[k + 1] ?? 0) + 0.114 * (data[k + 2] ?? 0);
    out[i] = 1 - luma / 255;
  }
  return { width, height, data: out };
}

/** Bilinear value at a sub-pixel position (pixel centres at i + 0.5, ADR 25), clamped at the border. */
export function sampleBilinear(image: FloatImage, x: number, y: number): number {
  const { width, height, data } = image;
  const fx = Math.min(width - 1, Math.max(0, x - 0.5));
  const fy = Math.min(height - 1, Math.max(0, y - 0.5));
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;
  const at = (px: number, py: number): number => data[py * width + px] ?? 0;
  return (
    (at(x0, y0) * (1 - tx) + at(x1, y0) * tx) * (1 - ty) + (at(x0, y1) * (1 - tx) + at(x1, y1) * tx) * ty
  );
}
