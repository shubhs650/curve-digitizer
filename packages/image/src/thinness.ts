import type { FloatImage, Mask } from './raster.ts';

/**
 * Otsu's threshold of a [0, 1] image: the level t that maximises the between-class variance
 * σ²_B(t) = ω₀(t) ω₁(t) (μ₀(t) − μ₁(t))² of the two classes v ≤ t and v > t, over a `bins`-bin histogram.
 * Returns the upper edge of the last bin of the lower class, so `v > t` selects the upper class.
 */
export function otsuThreshold(image: FloatImage, bins = 256): number {
  const histogram = new Float64Array(bins);
  for (const v of image.data) {
    const bin = Math.min(bins - 1, Math.max(0, Math.floor(v * bins)));
    histogram[bin] = (histogram[bin] ?? 0) + 1;
  }
  const total = image.data.length;
  let sumAll = 0;
  for (let i = 0; i < bins; i++) sumAll += (i + 0.5) * (histogram[i] ?? 0);
  let weight0 = 0;
  let sum0 = 0;
  let best = -1;
  let bestBin = 0;
  for (let i = 0; i < bins - 1; i++) {
    weight0 += histogram[i] ?? 0;
    sum0 += (i + 0.5) * (histogram[i] ?? 0);
    const weight1 = total - weight0;
    if (weight0 === 0 || weight1 === 0) continue;
    const mean0 = sum0 / weight0;
    const mean1 = (sumAll - sum0) / weight1;
    const between = weight0 * weight1 * (mean0 - mean1) ** 2;
    if (between > best) {
      best = between;
      bestBin = i;
    }
  }
  return (bestBin + 1) / bins;
}

/** 1 where `image` is above `threshold`. */
export function thresholdMask(image: FloatImage, threshold: number): Mask {
  const data = new Uint8Array(image.data.length);
  image.data.forEach((v, i) => {
    data[i] = v > threshold ? 1 : 0;
  });
  return { width: image.width, height: image.height, data };
}

const FAR = 1e20;

/**
 * Lower envelope of parabolas (Felzenszwalb & Huttenlocher 2012): d[q] = min_p (q − p)² + f[p] over one row or
 * column, in O(n). `f` is 0 at background and FAR elsewhere for the first pass.
 */
function envelope1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array): void {
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s: number;
    for (;;) {
      const p = v[k] ?? 0;
      s = ((f[q] ?? 0) + q * q - ((f[p] ?? 0) + p * p)) / (2 * (q - p));
      if (s > (z[k] ?? 0) || k === 0) break;
      k--;
    }
    if (s <= (z[k] ?? 0)) {
      v[k] = q;
      z[k] = -Infinity;
    } else {
      k++;
      v[k] = q;
      z[k] = s;
    }
    z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while ((z[k + 1] ?? Infinity) < q) k++;
    const p = v[k] ?? 0;
    d[q] = (q - p) ** 2 + (f[p] ?? 0);
  }
}

/**
 * Exact Euclidean distance transform: for each set pixel, the distance between its centre and the centre of the
 * nearest unset pixel, with everything outside the image counted as unset; 0 on unset pixels. A stroke w pixels
 * wide peaks at about w/2 on its centreline, which is what makes the transform a thinness measure.
 */
export function distanceTransform(mask: Mask): FloatImage {
  // Pad by one unset pixel on every side so the image border is background.
  const w = mask.width + 2;
  const h = mask.height + 2;
  const grid = new Float64Array(w * h);
  for (let y = 0; y < mask.height; y++) {
    for (let x = 0; x < mask.width; x++) {
      if (mask.data[y * mask.width + x]) grid[(y + 1) * w + x + 1] = FAR;
    }
  }
  const n = Math.max(w, h);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = grid[y * w + x] ?? 0;
    envelope1d(f, h, d, v, z);
    for (let y = 0; y < h; y++) grid[y * w + x] = d[y] ?? 0;
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = grid[y * w + x] ?? 0;
    envelope1d(f, w, d, v, z);
    for (let x = 0; x < w; x++) grid[y * w + x] = d[x] ?? 0;
  }
  const out = new Float32Array(mask.width * mask.height);
  for (let y = 0; y < mask.height; y++) {
    for (let x = 0; x < mask.width; x++) out[y * mask.width + x] = Math.sqrt(grid[(y + 1) * w + x + 1] ?? 0);
  }
  return { width: mask.width, height: mask.height, data: out };
}

/** Ink, its distance transform and Otsu's split between ink and paper, for one image region. */
export interface ThinnessMap {
  readonly darkness: FloatImage;
  readonly threshold: number;
  readonly mask: Mask;
  readonly distance: FloatImage;
  /**
   * 1 / distance on ink, 0 on paper: 1 at the centre of a 1–2 px stroke, ½ at the centre of a 4 px one, small
   * inside filled areas and thick blobs (minimal M1 version; task 2.1 adds the full map with grid suppression).
   */
  readonly thinness: FloatImage;
}

/**
 * Builds the thinness map of a darkness image. Otsu needs both classes present; a region with almost no ink
 * (contrast below `minContrast`) gets an empty mask rather than a threshold that splits paper noise.
 */
export function thinnessMap(dark: FloatImage, minContrast = 0.15): ThinnessMap {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of dark.data) {
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  const threshold = hi - lo < minContrast ? Infinity : otsuThreshold(dark);
  const mask = thresholdMask(dark, threshold);
  const distance = distanceTransform(mask);
  const thinness = new Float32Array(distance.data.length);
  distance.data.forEach((dist, i) => {
    thinness[i] = dist > 0 ? 1 / dist : 0;
  });
  return { darkness: dark, threshold, mask, distance, thinness: { ...distance, data: thinness } };
}
