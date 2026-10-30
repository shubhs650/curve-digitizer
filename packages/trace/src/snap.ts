import { cropRaster, darkness, type FloatImage, type Raster, sampleBilinear, thinnessMap } from '@cd/image';

export type Vec2 = readonly [number, number];

/** Strokes wider than twice this are filled areas or blobs (legend swatches, bars), not curves. */
export const MAX_STROKE_HALF_WIDTH_PX = 6;

export interface SnapResult {
  /** On the stroke's centreline, in the same image px as the click. */
  readonly px: Vec2;
  /** Ink width across the stroke there, for the point's uncertainty (ARCHITECTURE §5). */
  readonly lineWidthPx: number;
}

/**
 * Magnetic snap (ARCHITECTURE §8.4): moves a click to the centreline of the nearest stroke within `radiusPx`.
 *
 * 1. Thinness map of a window around the click (darkness → Otsu mask → distance transform).
 * 2. The nearest ridge pixel: an ink pixel whose distance-to-paper is a local maximum across the stroke, i.e.
 *    along at least one of the four pixel directions, and no more than MAX_STROKE_HALF_WIDTH_PX.
 * 3. Sub-pixel centre: the ink-weighted mean position on a profile along the stroke normal, which is the
 *    minor axis of the ink's second moments around the ridge pixel.
 *
 * `raster` may be a window of the image whose top-left corner is at image px `origin`. Returns null when no
 * stroke is in reach, so the caller keeps the click where it was.
 */
export function snapToCurve(
  raster: Raster,
  click: Vec2,
  radiusPx: number,
  origin: Vec2 = [0, 0],
): SnapResult | null {
  const reach = Math.ceil(radiusPx + 2 * MAX_STROKE_HALF_WIDTH_PX + 2);
  const left = Math.floor(click[0] - origin[0]) - reach;
  const top = Math.floor(click[1] - origin[1]) - reach;
  const window = cropRaster(raster, left, top, 2 * reach + 1, 2 * reach + 1);
  const wx = Math.max(0, left);
  const wy = Math.max(0, top);
  if (window.width === 0 || window.height === 0) return null;
  // Click in window px.
  const cx = click[0] - origin[0] - wx;
  const cy = click[1] - origin[1] - wy;

  const map = thinnessMap(darkness(window));
  const { width, height } = window;
  const dist = map.distance.data;
  const at = (x: number, y: number): number =>
    x < 0 || y < 0 || x >= width || y >= height ? 0 : (dist[y * width + x] ?? 0);

  let best: Vec2 | null = null;
  let bestDistance = radiusPx;
  for (let y = Math.max(0, Math.floor(cy - radiusPx)); y <= Math.min(height - 1, cy + radiusPx); y++) {
    for (let x = Math.max(0, Math.floor(cx - radiusPx)); x <= Math.min(width - 1, cx + radiusPx); x++) {
      const d = at(x, y);
      if (d === 0 || d > MAX_STROKE_HALF_WIDTH_PX) continue;
      const fromClick = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (fromClick > bestDistance || !isRidge(at, x, y, d)) continue;
      best = [x + 0.5, y + 0.5];
      bestDistance = fromClick;
    }
  }
  if (best === null) return null;

  const ridge = at(Math.floor(best[0]), Math.floor(best[1]));
  // A second pass re-centres the moments window on the stroke, which straightens the normal estimate.
  const first = centreAcross(map.darkness, best, ridge, map.threshold);
  const refined = centreAcross(map.darkness, first.px, ridge, map.threshold);
  return { px: [refined.px[0] + wx + origin[0], refined.px[1] + wy + origin[1]], lineWidthPx: refined.width };
}

const DIRECTIONS: readonly Vec2[] = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];

/** A local maximum of the distance transform along some direction: the stroke's centre across it. */
function isRidge(at: (x: number, y: number) => number, x: number, y: number, d: number): boolean {
  return DIRECTIONS.some(([dx, dy]) => {
    const a = at(x + dx, y + dy);
    const b = at(x - dx, y - dy);
    return d >= a && d >= b && (d > a || d > b);
  });
}

const PROFILE_STEP_PX = 0.25;

/**
 * Refines a ridge pixel centre to the ink-weighted centre across the stroke, and measures the stroke's width
 * there as ∫ink / max ink along the normal. Ink below half the Otsu level (anti-aliasing fringes of grid lines,
 * paper texture) carries no weight.
 */
function centreAcross(
  dark: FloatImage,
  centre: Vec2,
  ridge: number,
  threshold: number,
): { readonly px: Vec2; readonly width: number } {
  const floor = threshold / 2;
  const weight = (x: number, y: number) => Math.max(0, sampleBilinear(dark, x, y) - floor);
  const reach = Math.ceil(ridge) + 1.5;

  // Second moments of the ink around the ridge pixel; the stroke runs along the major axis.
  let sw = 0;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let dy = -reach; dy <= reach; dy += 0.5) {
    for (let dx = -reach; dx <= reach; dx += 0.5) {
      if (dx * dx + dy * dy > reach * reach) continue;
      const w = weight(centre[0] + dx, centre[1] + dy);
      sw += w;
      sx += w * dx;
      sy += w * dy;
      sxx += w * dx * dx;
      syy += w * dy * dy;
      sxy += w * dx * dy;
    }
  }
  if (sw === 0) return { px: centre, width: 2 * ridge - 1 };
  const mx = sx / sw;
  const my = sy / sw;
  const cxx = sxx / sw - mx * mx;
  const cyy = syy / sw - my * my;
  const cxy = sxy / sw - mx * my;
  // Major-axis angle of the 2 × 2 covariance; the normal is perpendicular to it.
  const along = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
  const normal: Vec2 = [-Math.sin(along), Math.cos(along)];

  let total = 0;
  let moment = 0;
  let peak = 0;
  for (let t = -reach; t <= reach; t += PROFILE_STEP_PX) {
    const w = weight(centre[0] + t * normal[0], centre[1] + t * normal[1]);
    total += w;
    moment += w * t;
    peak = Math.max(peak, w);
  }
  if (total === 0) return { px: centre, width: 2 * ridge - 1 };
  const offset = moment / total;
  return {
    px: [centre[0] + offset * normal[0], centre[1] + offset * normal[1]],
    width: (total * PROFILE_STEP_PX) / peak,
  };
}
