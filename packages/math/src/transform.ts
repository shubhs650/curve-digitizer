import { axisToValue, valueToAxis, type AxisTypes } from './axis.ts';
import { applyHomogeneous, invert3, lstsq, multiply3, RANK_TOLERANCE, svd } from './linalg.ts';
import { DegenerateError, type Mat3, type Vec2 } from './types.ts';

/** Calibration transform family (`Calibration.model`). Affine has 6 degrees of freedom, projective 8. */
export type TransformModel = 'affine' | 'projective';

/** One calibration correspondence: a pixel position and its known axis-space coordinate (`CalPoint`). */
export interface Correspondence {
  readonly px: Vec2;
  readonly axis: Vec2;
}

/**
 * Fewest correspondences that determine each model. The calibration tool asks for 4 regardless
 * (docs/ARCHITECTURE.md §5); affine accepts 3 because that is its mathematical minimum.
 */
export const MIN_CORRESPONDENCES: Readonly<Record<TransformModel, number>> = { affine: 3, projective: 4 };

interface Normalizer {
  readonly t: Mat3;
  readonly inverse: Mat3;
}

/**
 * Per-coordinate conditioning transform T: shifts each coordinate to zero mean and scales it to unit RMS
 * deviation. Solving in normalized coordinates (Hartley 1997) keeps the design matrix well conditioned even when
 * pixels are ~10³ and axis values ~10⁻⁶ or ~10⁵; it is scaled per coordinate, not isotropically, because x and y
 * axis units are unrelated.
 */
function normalizer(points: readonly Vec2[], what: string): Normalizer {
  const n = points.length;
  const mean = (k: 0 | 1): number => points.reduce((sum, p) => sum + p[k], 0) / n;
  const rmsDeviation = (k: 0 | 1, c: number): number =>
    Math.sqrt(points.reduce((sum, p) => sum + (p[k] - c) ** 2, 0) / n);
  const cx = mean(0);
  const cy = mean(1);
  const sx = 1 / rmsDeviation(0, cx);
  const sy = 1 / rmsDeviation(1, cy);
  if (!Number.isFinite(sx) || !Number.isFinite(sy) || !(sx > 0) || !(sy > 0)) {
    throw new DegenerateError(`Calibration ${what} coordinates do not vary in both x and y`);
  }
  return {
    t: [sx, 0, -sx * cx, 0, sy, -sy * cy, 0, 0, 1],
    inverse: [1 / sx, 0, cx, 0, 1 / sy, cy, 0, 0, 1],
  };
}

function checkCount(points: readonly Correspondence[], model: TransformModel): void {
  const min = MIN_CORRESPONDENCES[model];
  if (points.length < min) {
    throw new RangeError(
      `A ${model} calibration needs at least ${String(min)} points, got ${String(points.length)}`,
    );
  }
  for (const { px, axis } of points) {
    if (![...px, ...axis].every(Number.isFinite))
      throw new RangeError('Calibration coordinates must be finite');
  }
}

function normalize(points: readonly Correspondence[]) {
  const tp = normalizer(
    points.map((p) => p.px),
    'pixel',
  );
  const ta = normalizer(
    points.map((p) => p.axis),
    'axis',
  );
  return {
    tp,
    ta,
    pn: points.map((p) => applyHomogeneous(tp.t, p.px)),
    an: points.map((p) => applyHomogeneous(ta.t, p.axis)),
  };
}

/**
 * Least-squares affine px → axis transform from ≥ 3 correspondences.
 *
 * Model: `[u, v]ᵀ = A·[x, y]ᵀ + t` (6 parameters, last matrix row `[0, 0, 1]`). The u and v rows are independent
 * linear least-squares problems `[x y 1]·[a b c]ᵀ = u`, solved by QR in normalized coordinates and mapped back
 * with `M = Tₐ⁻¹·Hₙ·Tₚ`. Minimises the sum of squared axis-space residuals.
 *
 * @throws DegenerateError when the pixel points are collinear or coincident.
 */
export function solveAffine(points: readonly Correspondence[]): Mat3 {
  checkCount(points, 'affine');
  const { tp, ta, pn, an } = normalize(points);
  const design = pn.map(([x, y]) => [x, y, 1]);
  const [a = 0, b = 0, c = 0] = lstsq(
    design,
    an.map((p) => p[0]),
  );
  const [d = 0, e = 0, f = 0] = lstsq(
    design,
    an.map((p) => p[1]),
  );
  return multiply3(multiply3(ta.inverse, [a, b, c, d, e, f, 0, 0, 1]), tp.t);
}

/**
 * Projective px → axis transform (homography) from ≥ 4 correspondences by the normalized direct linear transform.
 *
 * Each correspondence (x, y) → (u, v) contributes two rows of A·h = 0 with h the 9 entries of H:
 * `[x y 1 0 0 0 −ux −uy −u]` and `[0 0 0 x y 1 −vx −vy −v]`. h is the right singular vector of A with the smallest
 * singular value (exact for 4 points, algebraic least squares for more). Solved in normalized coordinates, mapped
 * back with `M = Tₐ⁻¹·Hₙ·Tₚ`, then scaled so `M[8] = 1`.
 *
 * @throws DegenerateError when the solution is not unique (three or more points collinear) or when the
 *   calibration points would straddle the transform's line at infinity.
 */
export function solveProjective(points: readonly Correspondence[]): Mat3 {
  checkCount(points, 'projective');
  const { tp, ta, pn, an } = normalize(points);
  const rows: number[][] = [];
  pn.forEach(([x, y], i) => {
    const [u, v] = an[i] ?? [Number.NaN, Number.NaN];
    rows.push([x, y, 1, 0, 0, 0, -u * x, -u * y, -u], [0, 0, 0, x, y, 1, -v * x, -v * y, -v]);
  });
  const { values, v } = svd(rows);
  const largest = values[0] ?? 0;
  // A unique homography needs a one-dimensional null space: the second-smallest singular value must be non-zero.
  if (!((values[7] ?? 0) > RANK_TOLERANCE * largest)) {
    throw new DegenerateError('Projective calibration is not unique; are three of the points collinear?');
  }
  const [h0 = 0, h1 = 0, h2 = 0, h3 = 0, h4 = 0, h5 = 0, h6 = 0, h7 = 0, h8 = 0] = v[8] ?? [];
  const m = multiply3(multiply3(ta.inverse, [h0, h1, h2, h3, h4, h5, h6, h7, h8]), tp.t);
  const w = points.map(({ px: [x, y] }) => m[6] * x + m[7] * y + m[8]);
  if (!(w.every((wi) => wi > 0) || w.every((wi) => wi < 0))) {
    throw new DegenerateError('Projective calibration folds the chart through infinity');
  }
  const k = 1 / m[8];
  return [m[0] * k, m[1] * k, m[2] * k, m[3] * k, m[4] * k, m[5] * k, m[6] * k, m[7] * k, 1];
}

/** Solves the calibration matrix for `model`; see {@link solveAffine} and {@link solveProjective}. */
export function solveTransform(model: TransformModel, points: readonly Correspondence[]): Mat3 {
  switch (model) {
    case 'affine':
      return solveAffine(points);
    case 'projective':
      return solveProjective(points);
  }
}

/** Maps a pixel position to axis space through calibration matrix `m`. */
export function applyTransform(m: Mat3, px: Vec2): Vec2 {
  return applyHomogeneous(m, px);
}

/** Calibration fit quality, reported per correspondence and overall. */
export interface Residuals {
  /** Pixel distance between each picked point and where its axis value maps back to, ‖M⁻¹(axisᵢ) − pxᵢ‖. */
  readonly px: readonly number[];
  /** Axis-space error of each picked point, M(pxᵢ) − axisᵢ (in log10 decades on log axes). */
  readonly axis: readonly Vec2[];
  /** Root mean square of `px`; this is `Calibration.residualPx` and target A1. */
  readonly rmsPx: number;
}

/**
 * Residuals of calibration matrix `m` against its correspondences. The pixel residual is measured in pixel space
 * through the inverse transform so it is comparable across axes with different units.
 */
export function residuals(m: Mat3, points: readonly Correspondence[]): Residuals {
  const inverse = invert3(m);
  const px = points.map((p) => {
    const [x, y] = applyHomogeneous(inverse, p.axis);
    return Math.hypot(x - p.px[0], y - p.px[1]);
  });
  const axis = points.map((p): Vec2 => {
    const [u, v] = applyHomogeneous(m, p.px);
    return [u - p.axis[0], v - p.axis[1]];
  });
  const rmsPx = px.length === 0 ? 0 : Math.sqrt(px.reduce((sum, r) => sum + r * r, 0) / px.length);
  return { px, axis, rmsPx };
}

/** Pixel position → data value: through `m` into axis space, then out of log space where an axis is log10. */
export function pixelToValue(m: Mat3, axes: AxisTypes, px: Vec2): Vec2 {
  return axisToValue(applyHomogeneous(m, px), axes);
}

/**
 * Data value → pixel position, the inverse of {@link pixelToValue}; used to draw grid lines and fits over the image.
 *
 * @throws RangeError for a non-positive value on a log10 axis; DegenerateError if `m` is singular.
 */
export function valueToPixel(m: Mat3, axes: AxisTypes, value: Vec2): Vec2 {
  return applyHomogeneous(invert3(m), valueToAxis(value, axes));
}
