import { otsuThreshold } from '../thinness.ts';
import { type FilterOp, luma, mapPixels, numberParam, booleanParam } from './types.ts';

/** Adds `value` × 255 to every channel; `value` in [−1, 1]. */
export const brightness: FilterOp<{ readonly value: number }> = {
  op: 'brightness',
  label: 'Brightness',
  defaults: { value: 0 },
  parse: (p) => ({ value: numberParam(p, 'value', 0, -1, 1) }),
  apply: (src, { value }, tick) => {
    const add = value * 255;
    return mapPixels(src, tick, (r, g, b, out) => {
      out[0] = r + add;
      out[1] = g + add;
      out[2] = b + add;
    });
  },
};

/** Fraction of pixels clipped at each end by the automatic contrast stretch. */
export const STRETCH_CLIP = 0.005;

/**
 * Contrast about mid-grey: c′ = (c − 127.5) · value + 127.5. With `auto`, the luma range between the 0.5th and
 * 99.5th percentiles is first stretched to 0–255 (the "contrast stretch" of the Enhance for tracing preset), so
 * a faded scan uses the full range whatever its paper and ink levels.
 */
export const contrast: FilterOp<{ readonly value: number; readonly auto: boolean }> = {
  op: 'contrast',
  label: 'Contrast',
  defaults: { value: 1, auto: false },
  parse: (p) => ({ value: numberParam(p, 'value', 1, 0, 10), auto: booleanParam(p, 'auto', false) }),
  apply: (src, { value, auto }, tick) => {
    let lo = 0;
    let hi = 255;
    if (auto) {
      const histogram = new Float64Array(256);
      const n = src.width * src.height;
      for (let i = 0; i < n; i++) {
        const k = i * 4;
        const bin = Math.round(luma(src.data[k] ?? 0, src.data[k + 1] ?? 0, src.data[k + 2] ?? 0));
        histogram[bin] = (histogram[bin] ?? 0) + 1;
      }
      lo = percentile(histogram, n, STRETCH_CLIP);
      hi = percentile(histogram, n, 1 - STRETCH_CLIP);
      if (hi <= lo) {
        lo = 0;
        hi = 255;
      }
    }
    // (c − lo)·255/(hi − lo) is the stretched level s; the contrast factor then gives (s − 127.5)·value + 127.5.
    const lut = Uint8ClampedArray.from(
      { length: 256 },
      (_, c) => (((c - lo) * 255) / (hi - lo) - 127.5) * value + 127.5,
    );
    return mapPixels(src, tick, (r, g, b, out) => {
      out[0] = lut[r] ?? 0;
      out[1] = lut[g] ?? 0;
      out[2] = lut[b] ?? 0;
    });
  },
};

function percentile(histogram: Float64Array, n: number, q: number): number {
  let seen = 0;
  for (let v = 0; v < 256; v++) {
    seen += histogram[v] ?? 0;
    if (seen > q * n) return v;
  }
  return 255;
}

/** Rec. 601 luma into R, G and B. */
export const grayscale: FilterOp<Record<string, never>> = {
  op: 'grayscale',
  label: 'Grayscale',
  defaults: {},
  parse: () => ({}),
  apply: (src, _params, tick) =>
    mapPixels(src, tick, (r, g, b, out) => {
      const y = luma(r, g, b);
      out[0] = y;
      out[1] = y;
      out[2] = y;
    }),
};

/** 255 − c per channel: turns a dark-background chart into dark ink on light paper for the tracers. */
export const invert: FilterOp<Record<string, never>> = {
  op: 'invert',
  label: 'Invert',
  defaults: {},
  parse: () => ({}),
  apply: (src, _params, tick) =>
    mapPixels(src, tick, (r, g, b, out) => {
      out[0] = 255 - r;
      out[1] = 255 - g;
      out[2] = 255 - b;
    }),
};

/**
 * Black where darkness (1 − luma/255) exceeds `level`, white elsewhere. Without `level`, Otsu's threshold of the
 * image's darkness is used, which splits ink from paper on any reasonably bimodal chart.
 */
export const threshold: FilterOp<{ readonly level: number | null }> = {
  op: 'threshold',
  label: 'Threshold',
  defaults: { level: null },
  parse: (p) => ({
    level: p.level === undefined || p.level === null ? null : numberParam(p, 'level', 0.5, 0, 1),
  }),
  apply: (src, { level }, tick) => {
    const dark = new Float32Array(src.width * src.height);
    for (let i = 0; i < dark.length; i++) {
      const k = i * 4;
      dark[i] = 1 - luma(src.data[k] ?? 0, src.data[k + 1] ?? 0, src.data[k + 2] ?? 0) / 255;
    }
    const t = level ?? otsuThreshold({ width: src.width, height: src.height, data: dark });
    let i = 0;
    return mapPixels(src, tick, (_r, _g, _b, out) => {
      const v = (dark[i++] ?? 0) > t ? 0 : 255;
      out[0] = v;
      out[1] = v;
      out[2] = v;
    });
  },
};
