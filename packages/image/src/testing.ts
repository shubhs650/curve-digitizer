// `@cd/image/testing`: a tiny rasteriser for tests and benchmarks. Strokes are drawn with a coverage
// approximated from each pixel centre's distance to the centreline.
import type { RgbaRaster } from './ops/types.ts';

export type Pt = readonly [number, number];

export function canvas(
  width: number,
  height: number,
  paper: readonly [number, number, number] = [255, 255, 255],
) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set([paper[0], paper[1], paper[2], 255], i * 4);
  return { width, height, channels: 4 as const, data } satisfies RgbaRaster;
}

function segmentDistance(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

/** Strokes the polyline with `width` px and `color`, blending by approximate coverage. */
export function stroke(
  img: RgbaRaster,
  points: readonly Pt[],
  width: number,
  color: readonly [number, number, number],
) {
  const nearest = new Float32Array(img.width * img.height).fill(Infinity);
  const pad = width + 2;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] as Pt;
    const b = points[i] as Pt;
    const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0]) - pad));
    const x1 = Math.min(img.width - 1, Math.ceil(Math.max(a[0], b[0]) + pad));
    const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1]) - pad));
    const y1 = Math.min(img.height - 1, Math.ceil(Math.max(a[1], b[1]) + pad));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = segmentDistance([x + 0.5, y + 0.5], a, b);
        const k = y * img.width + x;
        if (d < (nearest[k] ?? Infinity)) nearest[k] = d;
      }
    }
  }
  nearest.forEach((d, k) => {
    const cover = Math.max(0, Math.min(1, width / 2 + 0.5 - d));
    if (cover === 0) return;
    for (let ch = 0; ch < 3; ch++) {
      img.data[k * 4 + ch] = (img.data[k * 4 + ch] ?? 0) * (1 - cover) + (color[ch] ?? 0) * cover;
    }
  });
  return img;
}

/** The polyline of y = f(x) sampled every px from x0 to x1. */
export function curve(f: (x: number) => number, x0: number, x1: number): Pt[] {
  const out: Pt[] = [];
  for (let x = x0; x <= x1; x += 1) out.push([x, f(x)]);
  return out;
}

export function rgbAt(img: RgbaRaster, x: number, y: number): [number, number, number] {
  const k = (Math.floor(y) * img.width + Math.floor(x)) * 4;
  return [img.data[k] ?? 0, img.data[k + 1] ?? 0, img.data[k + 2] ?? 0];
}
