import type { FloatImage, Raster } from './raster.ts';

export type Rgb = readonly [number, number, number];
export type Lab = readonly [number, number, number];

/** sRGB transfer function inverse for each 8-bit level: c ≤ 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055)^2.4. */
const LINEAR = Float64Array.from({ length: 256 }, (_, i) => {
  const c = i / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});

// D65 reference white (CIE 1931 2°), the white point of sRGB.
const XN = 0.95047;
const YN = 1;
const ZN = 1.08883;
const DELTA = 6 / 29;

/** CIELAB companding: f(t) = ∛t above δ³, else t / (3δ²) + 4/29. */
function f(t: number): number {
  return t > DELTA ** 3 ? Math.cbrt(t) : t / (3 * DELTA * DELTA) + 4 / 29;
}

/**
 * CIELAB (D65) of an 8-bit sRGB colour: linearise, XYZ through the sRGB primaries (IEC 61966-2-1 matrix), then
 * L* = 116 f(Y/Yn) − 16, a* = 500 (f(X/Xn) − f(Y/Yn)), b* = 200 (f(Y/Yn) − f(Z/Zn)).
 */
export function rgbToLab(r: number, g: number, b: number): Lab {
  const lr = LINEAR[clamp8(r)] ?? 0;
  const lg = LINEAR[clamp8(g)] ?? 0;
  const lb = LINEAR[clamp8(b)] ?? 0;
  const x = 0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb;
  const y = 0.2126729 * lr + 0.7151522 * lg + 0.072175 * lb;
  const z = 0.0193339 * lr + 0.119192 * lg + 0.9503041 * lb;
  const fx = f(x / XN);
  const fy = f(y / YN);
  const fz = f(z / ZN);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** CIE76 colour difference ΔE*ab, the Euclidean distance in CIELAB: about 2.3 is a just-noticeable difference. */
export function deltaE(a: Lab, b: Lab): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function clamp8(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

/** `#rgb` or `#rrggbb` (case-insensitive) as 8-bit channels; null when it is neither. */
export function parseHexColor(text: string): Rgb | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text.trim());
  if (!m?.[1]) return null;
  const digits = m[1];
  const hex = digits.length === 3 ? digits.replace(/./g, (c) => c + c) : digits;
  return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
}

/** `#rrggbb`, lower case. */
export function toHexColor([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((v) => clamp8(v).toString(16).padStart(2, '0')).join('')}`;
}

/** The 8-bit colour of pixel (x, y); grey rasters repeat their one channel. */
export function pixelRgb(raster: Raster, x: number, y: number): Rgb {
  const { width, channels, data } = raster;
  const k = (Math.floor(y) * width + Math.floor(x)) * channels;
  if (channels === 1) {
    const v = data[k] ?? 0;
    return [v, v, v];
  }
  return [data[k] ?? 0, data[k + 1] ?? 0, data[k + 2] ?? 0];
}

/**
 * Mean colour of the `radius` neighbourhood of (x, y), weighted by each pixel's difference from the
 * neighbourhood's median colour (the paper, around a thin stroke) to the fourth power, so an eyedropper click on
 * a thin anti-aliased stroke returns the stroke's colour rather than a blend with the paper around it. Works for
 * dark ink on light paper and bright ink on a dark background alike.
 */
export function sampleStrokeColor(raster: Raster, x: number, y: number, radius = 4): Rgb {
  const colors: Rgb[] = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const px = Math.floor(x) + dx;
      const py = Math.floor(y) + dy;
      if (px < 0 || py < 0 || px >= raster.width || py >= raster.height) continue;
      colors.push(pixelRgb(raster, px, py));
    }
  }
  if (colors.length === 0) return pixelRgb(raster, x, y);
  const median = [0, 1, 2].map((c) => {
    const values = colors.map((v) => v[c as 0 | 1 | 2]).sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)] ?? 0;
  });
  let w = 0;
  const sum = [0, 0, 0];
  for (const c of colors) {
    const weight =
      (Math.hypot(c[0] - (median[0] ?? 0), c[1] - (median[1] ?? 0), c[2] - (median[2] ?? 0)) / 442) ** 4;
    w += weight;
    for (let k = 0; k < 3; k++) sum[k] = (sum[k] ?? 0) + weight * c[k as 0 | 1 | 2];
  }
  if (w === 0) return pixelRgb(raster, x, y);
  return [(sum[0] ?? 0) / w, (sum[1] ?? 0) / w, (sum[2] ?? 0) / w];
}

/**
 * ΔE*ab from `target` for every pixel. Distinct colours are converted once each (charts have few), so a large
 * image costs one table lookup per pixel after the first occurrence of each colour.
 */
export function colorDistance(raster: Raster, target: Rgb, tick?: (row: number) => void): FloatImage {
  const { width, height, channels, data } = raster;
  const lab = rgbToLab(...target);
  const out = new Float32Array(width * height);
  const memo = new Map<number, number>();
  for (let y = 0; y < height; y++) {
    tick?.(y);
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const k = i * channels;
      const r = data[k] ?? 0;
      const g = channels === 1 ? r : (data[k + 1] ?? 0);
      const b = channels === 1 ? r : (data[k + 2] ?? 0);
      const key = (r << 16) | (g << 8) | b;
      let d = memo.get(key);
      if (d === undefined) {
        d = deltaE(rgbToLab(r, g, b), lab);
        memo.set(key, d);
      }
      out[i] = d;
    }
  }
  return { width, height, data: out };
}
