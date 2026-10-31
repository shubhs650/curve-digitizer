import type { FloatImage, Mask } from './raster.ts';
import { thresholdMask } from './thinness.ts';

export type LineOrientation = 'horizontal' | 'vertical';

const DEG = Math.PI / 180;

/**
 * Along-line (u) and across-line (v) extents for an orientation, and the index steps that turn (u, v) into a
 * pixel index: index = u·stepU + v·stepV.
 */
function axes(orientation: LineOrientation, width: number, height: number) {
  return orientation === 'horizontal'
    ? { long: width, short: height, stepU: 1, stepV: width }
    : { long: height, short: width, stepU: width, stepV: 1 };
}

/** Ink pixels sampled for the tilt search; more adds time, not accuracy. */
const ANGLE_SAMPLES = 60_000;

/**
 * The tilt of a family of nearly axis-aligned lines (scanned pages are rarely square): the angle θ within
 * ±`maxDeg` whose sheared projection v − u·tan θ of the ink is most concentrated, measured as Σ count² over
 * the projection bins (a straight line falls in one bin only at its own angle). Coarse 0.25° search, then a
 * 0.02° refinement around the best. Returns radians; positive means v grows along u.
 */
export function estimateLineAngle(
  mask: Mask,
  orientation: LineOrientation,
  maxDeg = 5,
  tick?: () => void,
): number {
  const { width, height, data } = mask;
  let count = 0;
  for (const v of data) count += v;
  if (count === 0) return 0;
  const stride = Math.max(1, Math.floor(count / ANGLE_SAMPLES));
  const n = Math.ceil(count / stride);
  const us = new Float64Array(n);
  const vs = new Float64Array(n);
  let seen = 0;
  let k = 0;
  for (let i = 0; i < data.length; i++) {
    if (!data[i]) continue;
    if (seen++ % stride !== 0) continue;
    const x = i % width;
    const y = (i - x) / width;
    us[k] = orientation === 'horizontal' ? x : y;
    vs[k] = orientation === 'horizontal' ? y : x;
    k++;
  }
  const { long, short } = axes(orientation, width, height);
  const offset = Math.ceil(long * Math.tan(maxDeg * DEG)) + 2;
  const bins = new Int32Array(short + 2 * offset + 2);
  const score = (deg: number): number => {
    tick?.();
    const t = Math.tan(deg * DEG);
    bins.fill(0);
    for (let i = 0; i < k; i++) {
      const b = Math.round((vs[i] ?? 0) - (us[i] ?? 0) * t) + offset;
      bins[b] = (bins[b] ?? 0) + 1;
    }
    let s = 0;
    for (const c of bins) s += c * c;
    return s;
  };
  const search = (from: number, to: number, step: number, start: number): number => {
    let best = start;
    let bestScore = score(start);
    for (let deg = from; deg <= to + 1e-9; deg += step) {
      const s = score(deg);
      // Ties go to the smaller tilt, so an untilted image reads exactly 0.
      if (s > bestScore || (s === bestScore && Math.abs(deg) < Math.abs(best))) {
        best = deg;
        bestScore = s;
      }
    }
    return best;
  };
  const coarse = search(-maxDeg, maxDeg, 0.25, 0);
  const fine = search(Math.max(-maxDeg, coarse - 0.25), Math.min(maxDeg, coarse + 0.25), 0.02, coarse);
  return fine * DEG;
}

/** Darkness above the paper level that still counts as ink for line detection (4σ of typical scan grain). */
export const FAINT_INK = 0.06;

/**
 * Everything darker than the paper: darkness above the median (paper is most of any chart) plus FAINT_INK.
 * Otsu would split black curves from paper and lose light-grey grid lines, which are exactly what grid
 * suppression is after.
 */
export function inkMask(dark: FloatImage): Mask {
  const bins = 1024;
  const histogram = new Int32Array(bins);
  for (const v of dark.data) {
    const b = Math.min(bins - 1, Math.max(0, Math.floor(v * bins)));
    histogram[b] = (histogram[b] ?? 0) + 1;
  }
  let seen = 0;
  let paper = 0;
  for (let b = 0; b < bins; b++) {
    seen += histogram[b] ?? 0;
    if (seen * 2 >= dark.data.length) {
      paper = (b + 0.5) / bins;
      break;
    }
  }
  return thresholdMask(dark, paper + FAINT_INK);
}

export interface GridLineOptions {
  /** Shortest straight run that counts as a grid line, in px along the line. */
  readonly minRunPx: number;
  /** Gaps up to this many px (dotted grids, scan dropouts) do not break a run; also the width slack at crossings. */
  readonly tolerance: number;
  /** Tilt search range, in degrees. */
  readonly maxTiltDeg?: number;
}

/**
 * Pixels of `ink` that belong to long straight grid lines (ARCHITECTURE §8 pre-processing: long horizontal and
 * vertical run detection). For each orientation the lines' tilt is estimated, the image is walked along lines
 * at that tilt, and ink runs of at least `minRunPx` (bridging gaps ≤ `tolerance`) are flagged. A flagged pixel
 * whose ink extends across the line further than a grid line does (median across-width + `tolerance`) is where
 * a curve crosses the line, and is left alone so the curve keeps its continuity.
 *
 * A curve segment that is itself straight and axis-aligned for `minRunPx` looks exactly like a grid line, so
 * `minRunPx` should be longer than any such segment and shorter than the grid lines.
 */
export function detectGridLines(ink: Mask, options: GridLineOptions, tick?: () => void): Mask {
  const out = new Uint8Array(ink.data.length);
  for (const orientation of ['horizontal', 'vertical'] as const) {
    tick?.();
    const angle = estimateLineAngle(ink, orientation, options.maxTiltDeg ?? 5, tick);
    const flagged = flagRuns(ink, orientation, Math.tan(angle), options, tick);
    unflagCrossings(ink, orientation, flagged, options.tolerance);
    for (const i of flagged) out[i] = 1;
  }
  return { width: ink.width, height: ink.height, data: out };
}

function flagRuns(
  ink: Mask,
  orientation: LineOrientation,
  t: number,
  { minRunPx, tolerance }: GridLineOptions,
  tick?: () => void,
): number[] {
  const { long, short, stepU, stepV } = axes(orientation, ink.width, ink.height);
  const data = ink.data;
  const flagged: number[] = [];
  const reach = Math.ceil(Math.abs(t) * long) + 1;
  // Row offsets along the line, shared by every walk: v = r + shift[u].
  const shift = Int32Array.from({ length: long }, (_, u) => Math.round(u * t));
  const set = (u: number, v: number): boolean => v >= 0 && v < short && data[u * stepU + v * stepV] === 1;
  // For every u, v = r + round(u·t) visits each pixel of the column exactly once as r steps over integers. A
  // line one or two px thick drifts by up to a pixel against that rounding, so each walk looks at rows v and
  // v + 1: a band two pixels high that always contains the line.
  for (let r = -reach; r < short + reach; r++) {
    if ((r & 63) === 0) tick?.();
    let start = -1;
    let last = -1;
    const close = () => {
      if (start >= 0 && last - start + 1 >= minRunPx) {
        for (let u = start; u <= last; u++) {
          const v = r + (shift[u] ?? 0);
          if (set(u, v)) flagged.push(u * stepU + v * stepV);
          if (set(u, v + 1)) flagged.push(u * stepU + (v + 1) * stepV);
        }
      }
      start = -1;
    };
    for (let u = 0; u < long; u++) {
      const v = r + (shift[u] ?? 0);
      if (!set(u, v) && !set(u, v + 1)) {
        if (start >= 0 && u - last > tolerance) close();
        continue;
      }
      if (start < 0) start = u;
      last = u;
    }
    close();
  }
  return flagged;
}

/** Removes from `flagged` (in place) the pixels whose across-line ink extent is wider than a grid line's. */
function unflagCrossings(
  ink: Mask,
  orientation: LineOrientation,
  flagged: number[],
  tolerance: number,
): void {
  if (flagged.length === 0) return;
  const { width, height, data } = ink;
  const extent = (i: number): number => {
    const x = i % width;
    const y = (i - x) / width;
    const [dx, dy] = orientation === 'horizontal' ? [0, 1] : [1, 0];
    let n = 1;
    for (let k = 1; ; k++) {
      const px = x + k * dx;
      const py = y + k * dy;
      if (px >= width || py >= height || !data[py * width + px]) break;
      n++;
    }
    for (let k = 1; ; k++) {
      const px = x - k * dx;
      const py = y - k * dy;
      if (px < 0 || py < 0 || !data[py * width + px]) break;
      n++;
    }
    return n;
  };
  const unique = [...new Set(flagged)];
  flagged.length = 0;
  flagged.push(...unique);
  const extents = flagged.map(extent);
  const sorted = Float64Array.from(extents).sort();
  const lineWidth = sorted[Math.floor(sorted.length / 2)] ?? 1;
  let k = 0;
  for (let j = 0; j < flagged.length; j++) {
    if ((extents[j] ?? 0) <= lineWidth + tolerance) flagged[k++] = flagged[j] ?? 0;
  }
  flagged.length = k;
}
