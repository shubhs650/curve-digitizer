import { detectGridLines, inkMask } from '../grid.ts';
import { darkness } from '../raster.ts';
import { type FilterOp, numberParam } from './types.ts';

/**
 * Grid-line suppression: paints the pixels of long straight horizontal and vertical lines (`detectGridLines`)
 * with the paper colour, plus the anti-aliased fringe on either side of them, leaving curve pixels where a
 * curve crosses a line. The paper colour is the per-channel median of the non-ink pixels.
 */
export const gridSuppress: FilterOp<{ readonly minRunPx: number; readonly tolerance: number }> = {
  op: 'gridSuppress',
  label: 'Suppress grid lines',
  defaults: { minRunPx: 200, tolerance: 2 },
  parse: (p) => ({
    minRunPx: Math.round(numberParam(p, 'minRunPx', 200, 10, 100_000)),
    tolerance: Math.round(numberParam(p, 'tolerance', 2, 0, 10)),
  }),
  apply: (src, { minRunPx, tolerance }, tick) => {
    const { width, height } = src;
    const dark = darkness(src);
    const ink = inkMask(dark);
    const lines = detectGridLines(ink, { minRunPx, tolerance }, tick);
    const paper = paperColor(src.data, ink.data);
    const out = { ...src, data: Uint8ClampedArray.from(src.data) };
    const paint = (i: number) => {
      out.data[i * 4] = paper[0];
      out.data[i * 4 + 1] = paper[1];
      out.data[i * 4 + 2] = paper[2];
    };
    for (let i = 0; i < lines.data.length; i++) {
      if (!lines.data[i]) continue;
      paint(i);
      // Fringe: anti-aliased pixels too faint for the ink mask, touching a removed line pixel.
      const x = i % width;
      const y = (i - x) / width;
      for (const [dx, dy] of [
        [0, 1],
        [0, -1],
        [1, 0],
        [-1, 0],
      ] as const) {
        const px = x + dx;
        const py = y + dy;
        if (px < 0 || py < 0 || px >= width || py >= height) continue;
        const j = py * width + px;
        if (!ink.data[j] && (dark.data[j] ?? 0) > 0) paint(j);
      }
    }
    return out;
  },
};

function paperColor(data: Uint8ClampedArray, ink: Uint8Array): readonly [number, number, number] {
  const histograms = [new Float64Array(256), new Float64Array(256), new Float64Array(256)] as const;
  let n = 0;
  for (let i = 0; i < ink.length; i++) {
    if (ink[i]) continue;
    n++;
    for (let c = 0; c < 3; c++) {
      const h = histograms[c as 0 | 1 | 2];
      const v = data[i * 4 + c] ?? 0;
      h[v] = (h[v] ?? 0) + 1;
    }
  }
  if (n === 0) return [255, 255, 255];
  const median = (h: Float64Array): number => {
    let seen = 0;
    for (let v = 0; v < 256; v++) {
      seen += h[v] ?? 0;
      if (seen * 2 >= n) return v;
    }
    return 255;
  };
  return [median(histograms[0]), median(histograms[1]), median(histograms[2])];
}
