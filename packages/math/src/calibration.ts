import type { AxisTypes } from './axis.ts';
import { lstsq } from './linalg.ts';
import { type Correspondence, residuals, type Residuals, solveTransform, type TransformModel } from './transform.ts';
import { DegenerateError, type Mat3, type Vec2 } from './types.ts';
import { axisJacobian, valueJacobian } from './uncertainty.ts';

/** A calibration click on one axis: its pixel position and the axis-space value of that axis there. */
export interface AxisPick {
  readonly px: Vec2;
  readonly axis: number;
}

/** Where the axes cross, in axis space: the v the X-axis picks lie on and the u the Y-axis picks lie on. */
export interface AxisCrossings {
  readonly xAxisAt: number;
  readonly yAxisAt: number;
}

/**
 * Solves where the axes cross when the user did not say, from two picks per axis (task 1.3).
 *
 * The x part of an affine map is u = a·px + b·py + c. The X picks give u(X1) = u₁, u(X2) = u₂ and the Y picks lie
 * on one vertical grid line, u(Y1) = u(Y2) = u_c, with u_c unknown: four linear equations in (a, b, c, u_c).
 * Likewise for v and v_c. Both systems are square, so four picks fix the affine exactly (zero residual).
 *
 * @throws DegenerateError when the picks of one axis coincide or the two axes are parallel.
 */
export function axisCrossings(
  x: readonly [AxisPick, AxisPick],
  y: readonly [AxisPick, AxisPick],
): AxisCrossings {
  const solveCrossing = (known: readonly AxisPick[], onLine: readonly AxisPick[]): number => {
    const rows = [
      ...known.map(({ px }) => [px[0], px[1], 1, 0]),
      ...onLine.map(({ px }) => [px[0], px[1], 1, -1]),
    ];
    const rhs = [...known.map((p) => p.axis), 0, 0];
    const solution = lstsq(rows, rhs);
    // lstsq solves rank-deficient systems in the least-norm sense; a square system must be exactly satisfied.
    const misfit = rows.reduce(
      (worst, row, i) => Math.max(worst, Math.abs(row.reduce((s, a, k) => s + a * (solution[k] ?? 0), 0) - (rhs[i] ?? 0))),
      0,
    );
    const scale = Math.max(1, ...rhs.map(Math.abs));
    const crossing = solution[3];
    if (crossing === undefined || !Number.isFinite(crossing) || misfit > 1e-6 * scale) {
      throw new DegenerateError('The calibration points do not define two crossing axes');
    }
    return crossing;
  };
  return { yAxisAt: solveCrossing(x, y), xAxisAt: solveCrossing(y, x) };
}

/** Thresholds for calibration warnings (PRD §4.3). */
export const CALIBRATION_LIMITS = {
  /** Two calibration clicks closer than this are probably a double click or the wrong tick. */
  minPointDistancePx: 20,
  /** Axes further than this from a right angle on the image are reported as skewed. */
  maxSkewDegrees: 1,
  /** A residual above this usually means a mistyped value or a wrong crossing. */
  maxResidualPx: 1,
} as const;

export type CalibrationWarning =
  | { readonly kind: 'pointsTooClose'; readonly distancePx: number }
  | { readonly kind: 'skew'; readonly degrees: number }
  | { readonly kind: 'highResidual'; readonly residualPx: number };

export interface CalibrationFit {
  readonly matrix: Mat3;
  readonly residuals: Residuals;
  /** Data units per image pixel along each axis, at the centre of the calibration points. */
  readonly resolution: { readonly xUnitsPerPx: number; readonly yUnitsPerPx: number };
  readonly warnings: readonly CalibrationWarning[];
}

/**
 * Solves a calibration and reports its quality: the px → axis matrix, residuals (A1), the digitization
 * resolution ‖∂value/∂px‖ per axis at the points' centroid, and warnings.
 *
 * Skew is the departure from 90° of the angle between the image directions of the two axes, the columns of the
 * inverse Jacobian J⁻¹ = ∂px/∂(u, v) at the centroid. Tilt alone (both axes rotated) is not skew.
 *
 * @throws RangeError for too few points; DegenerateError for collinear or coincident points.
 */
export function fitCalibration(
  model: TransformModel,
  points: readonly Correspondence[],
  axes: AxisTypes,
): CalibrationFit {
  const matrix = solveTransform(model, points);
  const fit = residuals(matrix, points);
  const centroid: Vec2 = [
    points.reduce((s, p) => s + p.px[0], 0) / points.length,
    points.reduce((s, p) => s + p.px[1], 0) / points.length,
  ];
  const [j00, j01, j10, j11] = valueJacobian(matrix, axes, centroid);
  const resolution = { xUnitsPerPx: Math.hypot(j00, j01), yUnitsPerPx: Math.hypot(j10, j11) };

  const warnings: CalibrationWarning[] = [];
  let closest = Infinity;
  points.forEach((a, i) => {
    for (const b of points.slice(i + 1)) closest = Math.min(closest, Math.hypot(a.px[0] - b.px[0], a.px[1] - b.px[1]));
  });
  if (closest < CALIBRATION_LIMITS.minPointDistancePx) warnings.push({ kind: 'pointsTooClose', distancePx: closest });

  const skew = skewDegrees(matrix, centroid);
  if (Math.abs(skew) > CALIBRATION_LIMITS.maxSkewDegrees) warnings.push({ kind: 'skew', degrees: skew });
  if (fit.rmsPx > CALIBRATION_LIMITS.maxResidualPx) warnings.push({ kind: 'highResidual', residualPx: fit.rmsPx });

  return { matrix, residuals: fit, resolution, warnings };
}

/** Angle between the image directions of the u and v axes at `px`, minus 90°, in degrees. */
export function skewDegrees(m: Mat3, px: Vec2): number {
  const [a, b, c, d] = axisJacobian(m, px);
  if (a * d - b * c === 0) throw new DegenerateError('Calibration matrix is singular');
  // Columns of J⁻¹ ∝ [[d, −b], [−c, a]]: the pixel step for +u is ∝ (d, −c), for +v ∝ (−b, a). The common
  // 1/det factor flips both or neither, so it does not change the angle.
  const cos = (d * -b + -c * a) / (Math.hypot(d, c) * Math.hypot(b, a));
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI - 90;
}
