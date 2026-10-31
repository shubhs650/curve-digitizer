import type { Raster } from '../raster.ts';

/** The processing stack's working format: 8-bit RGBA, rows top to bottom, alpha kept opaque. */
export interface RgbaRaster extends Raster {
  readonly channels: 4;
  readonly data: Uint8ClampedArray;
}

/** A step's parameters as stored in `project.json` (docs/PROJECT_SCHEMA.md `processing[]`), without `op`. */
export type StepParams = Readonly<Record<string, unknown>>;

/** Thrown by `FilterOp.parse` when a stored step's parameters are unusable. */
export class FilterParamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FilterParamError';
  }
}

/**
 * One filter of the closed set in `ops.ts`. `parse` validates stored parameters and fills defaults; `apply` is
 * pure and calls `tick` at least once per row so a worker can honour cancellation inside a long filter.
 */
export interface FilterOp<P> {
  readonly op: string;
  readonly label: string;
  /** Parameters for a newly added step. */
  readonly defaults: P;
  parse(params: StepParams): P;
  apply(src: RgbaRaster, params: P, tick: () => void): RgbaRaster;
}

export function blank(src: Raster): RgbaRaster {
  return {
    width: src.width,
    height: src.height,
    channels: 4,
    data: new Uint8ClampedArray(src.width * src.height * 4),
  };
}

/** Any raster as RGBA (grey repeats into R, G and B; alpha is set opaque because graph images are opaque). */
export function toRgba(src: Raster): RgbaRaster {
  const out = blank(src);
  const n = src.width * src.height;
  for (let i = 0; i < n; i++) {
    const k = i * src.channels;
    const r = src.data[k] ?? 0;
    out.data[i * 4] = r;
    out.data[i * 4 + 1] = src.channels === 1 ? r : (src.data[k + 1] ?? 0);
    out.data[i * 4 + 2] = src.channels === 1 ? r : (src.data[k + 2] ?? 0);
    out.data[i * 4 + 3] = 255;
  }
  return out;
}

/** A per-pixel colour map: `fn` gets R, G, B and writes into `rgb`. Alpha passes through. */
export function mapPixels(
  src: RgbaRaster,
  tick: () => void,
  fn: (r: number, g: number, b: number, rgb: [number, number, number]) => void,
): RgbaRaster {
  const out = blank(src);
  const rgb: [number, number, number] = [0, 0, 0];
  const { width, height, data } = src;
  for (let y = 0; y < height; y++) {
    tick();
    for (let k = y * width * 4, end = k + width * 4; k < end; k += 4) {
      fn(data[k] ?? 0, data[k + 1] ?? 0, data[k + 2] ?? 0, rgb);
      out.data[k] = rgb[0];
      out.data[k + 1] = rgb[1];
      out.data[k + 2] = rgb[2];
      out.data[k + 3] = data[k + 3] ?? 255;
    }
  }
  return out;
}

export function numberParam(
  params: StepParams,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const v = params[key];
  if (v === undefined) return fallback;
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new FilterParamError(`${key} must be a number`);
  if (v < min || v > max)
    throw new FilterParamError(`${key} must be between ${String(min)} and ${String(max)}`);
  return v;
}

export function booleanParam(params: StepParams, key: string, fallback: boolean): boolean {
  const v = params[key];
  if (v === undefined) return fallback;
  if (typeof v !== 'boolean') throw new FilterParamError(`${key} must be true or false`);
  return v;
}

/** Rec. 601 luma, the grey level the rest of the package uses (see `darkness`). */
export function luma(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}
