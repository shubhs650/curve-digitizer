import { RasterCache, type Raster, type RgbaRaster } from '@cd/image';
import type { TaskContext } from '../api.ts';

/**
 * The pixels a compute task works on: a graph's stored image, identified by `key` so the worker decodes it
 * once. Send `png` (the bytes in the project) or `rgba` (already decoded, e.g. in tests).
 */
export interface ImageSource {
  /** Unique per image content, e.g. `${graphId}:${image.path}`. */
  readonly key: string;
  readonly png?: ArrayBuffer;
  readonly rgba?: { readonly data: ArrayBuffer; readonly width: number; readonly height: number };
}

/** Decoded sources kept per worker; a graph switch evicts the oldest. */
const MAX_SOURCES = 3;
const sources = new Map<string, RgbaRaster>();

/** Processed rasters per worker, by source key and stack hash (ARCHITECTURE §7). */
export const processedCache = new RasterCache(256 * 1024 * 1024);

async function decodePng(png: ArrayBuffer): Promise<RgbaRaster> {
  // Decode without colour management or premultiplication so the pixels are the file's own (as imageToPng).
  const bitmap = await createImageBitmap(new Blob([png], { type: 'image/png' }), {
    colorSpaceConversion: 'none',
    premultiplyAlpha: 'none',
  });
  try {
    const { width, height } = bitmap;
    const context = new OffscreenCanvas(width, height).getContext('2d', { willReadFrequently: true });
    if (context === null) throw new Error('OffscreenCanvas 2D context unavailable');
    context.drawImage(bitmap, 0, 0);
    return { width, height, channels: 4, data: context.getImageData(0, 0, width, height).data };
  } finally {
    bitmap.close();
  }
}

/** The decoded source, from this worker's cache when it has decoded the same key before. */
export async function loadSource(source: ImageSource, ctx: TaskContext): Promise<Raster> {
  const hit = sources.get(source.key);
  if (hit !== undefined) {
    sources.delete(source.key);
    sources.set(source.key, hit);
    return hit;
  }
  let raster: RgbaRaster;
  if (source.rgba !== undefined) {
    const { data, width, height } = source.rgba;
    raster = { width, height, channels: 4, data: new Uint8ClampedArray(data) };
  } else if (source.png !== undefined) {
    raster = await decodePng(source.png);
  } else {
    throw new Error(`image ${source.key} was sent without pixels`);
  }
  ctx.throwIfCancelled();
  sources.set(source.key, raster);
  for (const key of sources.keys()) {
    if (sources.size <= MAX_SOURCES) break;
    sources.delete(key);
  }
  return raster;
}

/** Forgets decoded and processed images (tests; memory pressure). */
export function clearImageCaches(): void {
  sources.clear();
  processedCache.clear();
}
