/** A 2-vector, e.g. a pixel position `[x, y]` or an axis-space pair `[u, v]`. */
export type Vec2 = readonly [number, number];

/** A 3×3 matrix stored row-major, as in `Calibration.matrix` (docs/PROJECT_SCHEMA.md). */
export type Mat3 = readonly [number, number, number, number, number, number, number, number, number];

/** Thrown when input is too degenerate to define a unique answer (collinear points, singular matrix, …). */
export class DegenerateError extends Error {
  override readonly name = 'DegenerateError';
}

/** A 2×2 matrix stored row-major, e.g. a Jacobian `[∂u/∂x, ∂u/∂y, ∂v/∂x, ∂v/∂y]`. */
export type Mat2 = readonly [number, number, number, number];
