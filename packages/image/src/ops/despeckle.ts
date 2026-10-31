import { blank, type FilterOp, numberParam, type RgbaRaster } from './types.ts';

/**
 * Median filter over a (2r + 1)² square per channel, the image edge replicated. Dust specks and scan grain
 * smaller than about half the window vanish while strokes wider than r px keep their edges. Huang's sliding
 * histogram with an incrementally tracked median keeps the cost at O(r) per pixel.
 */
export const despeckle: FilterOp<{ readonly radius: number }> = {
  op: 'despeckle',
  label: 'Despeckle',
  defaults: { radius: 1 },
  parse: (p) => ({ radius: Math.round(numberParam(p, 'radius', 1, 1, 5)) }),
  apply: (src, { radius }, tick) => {
    const out = blank(src);
    const grey = isGrey(src);
    for (let c = 0; c < 3; c++) {
      if (grey && c > 0) break;
      medianChannel(src, out, c, radius, tick);
    }
    const n = src.width * src.height;
    for (let i = 0; i < n; i++) {
      const k = i * 4;
      if (grey) {
        out.data[k + 1] = out.data[k] ?? 0;
        out.data[k + 2] = out.data[k] ?? 0;
      }
      out.data[k + 3] = src.data[k + 3] ?? 255;
    }
    return out;
  },
};

function isGrey({ data }: RgbaRaster): boolean {
  for (let k = 0; k < data.length; k += 4)
    if (data[k] !== data[k + 1] || data[k] !== data[k + 2]) return false;
  return true;
}

function medianChannel(src: RgbaRaster, out: RgbaRaster, c: number, r: number, tick: () => void): void {
  const { width, height, data } = src;
  // The channel with r replicated pixels on every side, so the sliding window never needs a bounds check.
  const pw = width + 2 * r;
  const ph = height + 2 * r;
  const padded = new Uint8Array(pw * ph);
  for (let y = 0; y < ph; y++) {
    const sy = Math.min(height - 1, Math.max(0, y - r));
    for (let x = 0; x < pw; x++) {
      const sx = Math.min(width - 1, Math.max(0, x - r));
      padded[y * pw + x] = data[(sy * width + sx) * 4 + c] ?? 0;
    }
  }
  const histogram = new Int32Array(256);
  const side = 2 * r + 1;
  const half = Math.floor((side * side) / 2);
  for (let y = 0; y < height; y++) {
    tick();
    histogram.fill(0);
    for (let dy = 0; dy < side; dy++) {
      for (let dx = 0; dx < side; dx++) {
        const v = padded[(y + dy) * pw + dx] ?? 0;
        histogram[v] = (histogram[v] ?? 0) + 1;
      }
    }
    // m is the median and below the number of window values < m; the median is the smallest m with
    // below + histogram[m] > half.
    let m = 0;
    let below = 0;
    while (below + (histogram[m] ?? 0) <= half) below += histogram[m++] ?? 0;
    const row = y * width * 4 + c;
    out.data[row] = m;
    for (let x = 1; x < width; x++) {
      // Window columns x … x + 2r in padded coordinates: drop column x − 1, add column x + 2r.
      for (let dy = 0, k = y * pw + x - 1; dy < side; dy++, k += pw) {
        const gone = padded[k] ?? 0;
        const added = padded[k + side] ?? 0;
        histogram[gone] = (histogram[gone] ?? 0) - 1;
        histogram[added] = (histogram[added] ?? 0) + 1;
        if (gone < m) below--;
        if (added < m) below++;
      }
      while (below > half) below -= histogram[--m] ?? 0;
      while (below + (histogram[m] ?? 0) <= half) below += histogram[m++] ?? 0;
      out.data[row + x * 4] = m;
    }
  }
}
