import { deltaE, type FloatImage, type Raster, type Rgb, rgbToLab, sampleBilinear } from '@cd/image';

/** Tolerance limits for the ink map's colour falloff, in ΔE*ab. */
const MIN_TOLERANCE = 12;
const MAX_TOLERANCE = 60;
/** Share of the curve–paper colour distance at which a pixel stops counting as the curve's ink. */
const TOLERANCE_SHARE = 0.6;

/**
 * How much each pixel looks like the traced curve, in [0, 1]: 1 − ΔE(pixel, curve colour) / tolerance, clamped.
 * The tolerance is a share of the distance between the curve colour and the paper colour, so a black curve
 * ignores light-grey grid lines and a blue curve ignores an orange one, while the curve's own anti-aliased edge
 * still carries partial weight (which keeps the across-stroke centroid symmetric).
 */
export interface InkMap extends FloatImage {
  readonly color: Rgb;
  readonly paper: Rgb;
  readonly tolerance: number;
}

/** Per-channel median colour: paper on any chart, since paper is most of the pixels. */
export function paperColor(raster: Raster): Rgb {
  const { width, height, channels, data } = raster;
  const n = width * height;
  const medians = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const histogram = new Int32Array(256);
    const ch = channels === 1 ? 0 : c;
    for (let i = 0; i < n; i++) {
      const v = data[i * channels + ch] ?? 0;
      histogram[v] = (histogram[v] ?? 0) + 1;
    }
    let seen = 0;
    for (let v = 0; v < 256; v++) {
      seen += histogram[v] ?? 0;
      if (seen * 2 >= n) {
        medians[c] = v;
        break;
      }
    }
  }
  return [medians[0] ?? 255, medians[1] ?? 255, medians[2] ?? 255];
}

export function inkMap(
  raster: Raster,
  color: Rgb,
  tick?: () => void,
  paper: Rgb = paperColor(raster),
): InkMap {
  const { width, height, channels, data } = raster;
  const lab = rgbToLab(...color);
  const tolerance = Math.min(
    MAX_TOLERANCE,
    Math.max(MIN_TOLERANCE, TOLERANCE_SHARE * deltaE(lab, rgbToLab(...paper))),
  );
  const out = new Float32Array(width * height);
  const memo = new Map<number, number>();
  for (let y = 0; y < height; y++) {
    if ((y & 15) === 0) tick?.();
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const k = i * channels;
      const r = data[k] ?? 0;
      const g = channels === 1 ? r : (data[k + 1] ?? 0);
      const b = channels === 1 ? r : (data[k + 2] ?? 0);
      const key = (r << 16) | (g << 8) | b;
      let v = memo.get(key);
      if (v === undefined) {
        v = Math.max(0, 1 - deltaE(rgbToLab(r, g, b), lab) / tolerance);
        memo.set(key, v);
      }
      out[i] = v;
    }
  }
  return { width, height, data: out, color, paper, tolerance };
}

export function inkAt(map: FloatImage, x: number, y: number): number {
  if (x < 0 || y < 0 || x > map.width || y > map.height) return 0;
  return sampleBilinear(map, x, y);
}
