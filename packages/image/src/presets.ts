import { luma } from './ops/types.ts';
import type { Raster } from './raster.ts';
import type { StoredStep } from './stack.ts';

/**
 * PRD §4.6 "Enhance for tracing": grayscale → despeckle → grid suppression → contrast stretch. The grid
 * run length is half the image's shorter side: grid lines span the plot, while a curve is rarely straight and
 * level for that long (ADR 33).
 */
export function enhanceForTracing(width: number, height: number): StoredStep[] {
  return [
    { op: 'grayscale' },
    { op: 'despeckle', radius: 1 },
    { op: 'gridSuppress', minRunPx: Math.max(10, Math.round(Math.min(width, height) / 2)), tolerance: 2 },
    { op: 'contrast', value: 1, auto: true },
  ];
}

/** Luma below which the paper counts as dark (a mid grey is 128). */
const DARK_PAPER_LUMA = 100;

/**
 * Whether the chart's paper is dark (PRD §4.11: dark-background detection suggests Invert): the median luma,
 * which is the paper's on any chart, is below DARK_PAPER_LUMA. `raster` may be a downscaled copy.
 */
export function isDarkBackground(raster: Raster): boolean {
  const { width, height, channels, data } = raster;
  const n = width * height;
  if (n === 0) return false;
  const histogram = new Int32Array(256);
  for (let i = 0; i < n; i++) {
    const k = i * channels;
    const r = data[k] ?? 0;
    const y = channels === 1 ? r : Math.round(luma(r, data[k + 1] ?? 0, data[k + 2] ?? 0));
    histogram[y] = (histogram[y] ?? 0) + 1;
  }
  let seen = 0;
  for (let y = 0; y < 256; y++) {
    seen += histogram[y] ?? 0;
    if (seen * 2 >= n) return y < DARK_PAPER_LUMA;
  }
  return false;
}
