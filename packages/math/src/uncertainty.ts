import { fromAxisDerivative, type AxisTypes } from './axis.ts';
import { applyHomogeneous } from './linalg.ts';
import type { Mat2, Mat3, Vec2 } from './types.ts';

/** Standard uncertainty of locating a point to the nearest pixel, in px (docs/ARCHITECTURE.md §5). */
export const PICK_SIGMA_PX = 0.5;

/** Line width assumed when a point was not snapped or traced, so no stroke width was measured, in px. */
export const DEFAULT_LINE_WIDTH_PX = 2;

/**
 * Isotropic positional uncertainty of a picked point in px: `σₚₓ = √(0.5² + (lineWidthPx / 2)²)`, combining
 * the pick resolution with the half-width of the stroke the point sits on.
 *
 * @throws RangeError for a negative or non-finite line width.
 */
export function pixelSigma(lineWidthPx: number = DEFAULT_LINE_WIDTH_PX): number {
  if (!(lineWidthPx >= 0) || !Number.isFinite(lineWidthPx)) {
    throw new RangeError(
      `Line width must be a finite, non-negative number of px; got ${String(lineWidthPx)}`,
    );
  }
  return Math.hypot(PICK_SIGMA_PX, lineWidthPx / 2);
}

/**
 * Jacobian of the px → axis transform at `px`, row-major `[∂u/∂x, ∂u/∂y, ∂v/∂x, ∂v/∂y]`.
 *
 * With `[U, V, w]ᵀ = M·[x, y, 1]ᵀ` and `(u, v) = (U/w, V/w)`, the quotient rule gives
 * `∂u/∂x = (M₀ − u·M₆)/w`, `∂u/∂y = (M₁ − u·M₇)/w`, `∂v/∂x = (M₃ − v·M₆)/w`, `∂v/∂y = (M₄ − v·M₇)/w`.
 * For an affine M this is the constant linear part.
 */
export function axisJacobian(m: Mat3, [x, y]: Vec2): Mat2 {
  const w = m[6] * x + m[7] * y + m[8];
  const [u, v] = applyHomogeneous(m, [x, y]);
  return [(m[0] - u * m[6]) / w, (m[1] - u * m[7]) / w, (m[3] - v * m[6]) / w, (m[4] - v * m[7]) / w];
}

/**
 * Jacobian of the px → data-value mapping at `px`: the {@link axisJacobian} with each row scaled by dv/da of its
 * axis (`ln(10)·10^a` on log10 axes, 1 on linear axes).
 */
export function valueJacobian(m: Mat3, axes: AxisTypes, px: Vec2): Mat2 {
  const [j00, j01, j10, j11] = axisJacobian(m, px);
  const [u, v] = applyHomogeneous(m, px);
  const kx = fromAxisDerivative(u, axes.x);
  const ky = fromAxisDerivative(v, axes.y);
  return [kx * j00, kx * j01, ky * j10, ky * j11];
}

/**
 * Per-point uncertainty `Point.sigma` in data units.
 *
 * First-order propagation of an isotropic pixel covariance `σₚₓ²·I` through the local Jacobian J of
 * px → value: `Σ = σₚₓ²·J·Jᵀ`, so `σx = σₚₓ·‖J row 0‖` and `σy = σₚₓ·‖J row 1‖`. On a log10 axis this grows with
 * the value, as it should: a pixel spans more units further up a decade.
 */
export function pointSigma(
  m: Mat3,
  axes: AxisTypes,
  px: Vec2,
  lineWidthPx: number = DEFAULT_LINE_WIDTH_PX,
): Vec2 {
  const s = pixelSigma(lineWidthPx);
  const [j00, j01, j10, j11] = valueJacobian(m, axes, px);
  return [s * Math.hypot(j00, j01), s * Math.hypot(j10, j11)];
}
