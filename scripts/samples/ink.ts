// Measures where a rendered stroke actually is relative to a ground-truth centerline, so the harness can prove
// that source.png and ground-truth.json agree (to a fraction of a pixel) before any feature is scored on them.
import { pointAt, type Polyline } from './geometry.ts';
import type { RasterImage } from './png.ts';

export type Rgb = readonly [number, number, number];

export function hexToRgb(hex: string): Rgb {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) throw new Error(`colour ${hex} is not #rrggbb`);
  return [parseInt(m[1] ?? '', 16), parseInt(m[2] ?? '', 16), parseInt(m[3] ?? '', 16)];
}

/** Bilinear RGB at a sub-pixel position; pixel (i, j) has its value at (i + 0.5, j + 0.5) (ADR 24). */
export function bilinear(image: RasterImage, x: number, y: number): [number, number, number] {
  const { width, height, channels, data } = image;
  const fx = Math.min(width - 1, Math.max(0, x - 0.5));
  const fy = Math.min(height - 1, Math.max(0, y - 0.5));
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;
  const out: [number, number, number] = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const ch = channels === 1 ? 0 : c;
    const at = (px: number, py: number): number => data[(py * width + px) * channels + ch] ?? 0;
    const top = at(x0, y0) * (1 - tx) + at(x1, y0) * tx;
    const bottom = at(x0, y1) * (1 - tx) + at(x1, y1) * tx;
    out[c] = top * (1 - ty) + bottom * ty;
  }
  return out;
}

const distance = (a: Rgb, b: Rgb): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export interface StrokeProbe {
  /** Arc-length position of the probe on the centerline. */
  readonly s: number;
  /** Signed distance, along the normal, from the centerline to the ink-weighted centre of the stroke, px. */
  readonly offset: number;
}

export interface ProbeOptions {
  readonly ink: Rgb;
  readonly lineWidthPx: number;
  readonly spacingPx: number;
  /** Return true to leave out a probe (crossings, dash gaps, line ends). */
  readonly skip?: (s: number) => boolean;
  /** Least colour distance between ink and local background for a probe to count. */
  readonly minContrast?: number;
}

const STEP_PX = 0.25;
const MARGIN_PX = 2.5;

/**
 * Samples a profile across the stroke at every probe, weights each sample by how close its colour is to the ink
 * (relative to the local background at the profile ends), and returns the weighted mean position.
 */
export function strokeOffsets(image: RasterImage, line: Polyline, options: ProbeOptions): StrokeProbe[] {
  const { ink, lineWidthPx, spacingPx, skip, minContrast = 40 } = options;
  const reach = lineWidthPx / 2 + MARGIN_PX;
  const out: StrokeProbe[] = [];
  for (let s = spacingPx / 2; s < line.length; s += spacingPx) {
    if (skip?.(s)) continue;
    const p = pointAt(line, s);
    const a = pointAt(line, Math.max(0, s - 1));
    const b = pointAt(line, Math.min(line.length, s + 1));
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len === 0) continue;
    const n: [number, number] = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
    const at = (t: number): Rgb => bilinear(image, p[0] + t * n[0], p[1] + t * n[1]);
    const lo = at(-reach);
    const hi = at(reach);
    const background: Rgb = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
    const contrast = distance(background, ink);
    if (contrast < minContrast) continue;
    let sum = 0;
    let weighted = 0;
    for (let t = -reach; t <= reach + 1e-9; t += STEP_PX) {
      const w = Math.min(1, Math.max(0, 1 - distance(at(t), ink) / contrast));
      sum += w;
      weighted += w * t;
    }
    if (sum > 0) out.push({ s, offset: weighted / sum });
  }
  return out;
}
