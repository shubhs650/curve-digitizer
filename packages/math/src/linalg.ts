import { DegenerateError, type Mat3, type Vec2 } from './types.ts';

/** A dense matrix as an array of rows. */
export type Matrix = readonly (readonly number[])[];

/**
 * Relative threshold below which a pivot or singular value is treated as zero.
 * Far above float64 round-off (~1e-16) so near-collinear calibrations are rejected rather than solved into
 * meaningless numbers, and far below what a real, well-spread calibration produces (≳1e-3 after normalization).
 */
export const RANK_TOLERANCE = 1e-10;

// Out-of-range reads become NaN so an indexing bug poisons the result visibly instead of reading as 0.
function at(a: ArrayLike<number>, i: number): number {
  return a[i] ?? Number.NaN;
}

function shape(a: Matrix): { rows: number; cols: number } {
  const rows = a.length;
  const cols = a[0]?.length ?? 0;
  if (a.some((row) => row.length !== cols)) throw new RangeError('Matrix rows must all have the same length');
  return { rows, cols };
}

/** Copies `a` (rows) into one Float64Array per column. */
function columns(a: Matrix, rows: number, cols: number): Float64Array[] {
  return Array.from({ length: cols }, (_, j) =>
    Float64Array.from({ length: rows }, (_, i) => at(a[i] ?? [], j)),
  );
}

function dot(a: Float64Array, b: Float64Array, from = 0): number {
  let sum = 0;
  for (let i = from; i < a.length; i++) sum += at(a, i) * at(b, i);
  return sum;
}

/**
 * Linear least squares: the `x` minimising ‖A·x − b‖₂ for an m×n matrix A with m ≥ n and full column rank.
 *
 * Householder QR (A = Q·R, then R·x = Qᵀ·b by back substitution), which avoids squaring the condition number
 * as the normal equations AᵀA·x = Aᵀb would.
 *
 * @throws DegenerateError when A is (numerically) rank deficient.
 */
export function lstsq(a: Matrix, b: readonly number[]): number[] {
  const { rows: m, cols: n } = shape(a);
  if (b.length !== m) throw new RangeError(`lstsq: b has ${String(b.length)} rows, A has ${String(m)}`);
  if (m < n) throw new RangeError(`lstsq: need at least ${String(n)} rows, got ${String(m)}`);
  const r = columns(a, m, n);
  const y = Float64Array.from(b);
  const v = new Float64Array(m);
  let maxDiag = 0;

  for (let k = 0; k < n; k++) {
    const col = r[k] ?? new Float64Array(m);
    const norm = Math.sqrt(dot(col, col, k));
    // Reflect onto −sign(a_kk)·‖a‖·e_k so v_k never suffers cancellation.
    const alpha = at(col, k) > 0 ? -norm : norm;
    v.fill(0);
    for (let i = k; i < m; i++) v[i] = at(col, i);
    v[k] = at(v, k) - alpha;
    const vv = dot(v, v, k);
    if (vv > 0) {
      for (let j = k; j < n; j++) {
        const cj = r[j] ?? new Float64Array(m);
        const t = (2 * dot(v, cj, k)) / vv;
        for (let i = k; i < m; i++) cj[i] = at(cj, i) - t * at(v, i);
      }
      const t = (2 * dot(v, y, k)) / vv;
      for (let i = k; i < m; i++) y[i] = at(y, i) - t * at(v, i);
    }
    maxDiag = Math.max(maxDiag, Math.abs(at(col, k)));
  }

  const x = new Array<number>(n).fill(0);
  for (let k = n - 1; k >= 0; k--) {
    const rkk = at(r[k] ?? [], k);
    if (!(Math.abs(rkk) > RANK_TOLERANCE * maxDiag))
      throw new DegenerateError('lstsq: matrix is rank deficient');
    let sum = at(y, k);
    for (let j = k + 1; j < n; j++) sum -= at(r[j] ?? [], k) * (x[j] ?? 0);
    x[k] = sum / rkk;
  }
  return x;
}

/** Singular values (descending) and the matching right singular vectors (as `v[i]`, one per value). */
export interface Svd {
  readonly values: readonly number[];
  readonly v: readonly (readonly number[])[];
}

const MAX_SWEEPS = 60;

/**
 * Singular values and right singular vectors of an m×n matrix A, so that A·vᵢ = σᵢ·uᵢ.
 *
 * One-sided (Hestenes) Jacobi: plane rotations J applied to the columns of A until every pair is orthogonal;
 * then A·V has orthogonal columns with norms σᵢ and V = ∏J. Works directly on A (no AᵀA), so small singular
 * values keep full relative accuracy. When m < n the missing rows are zero and the extra σ are 0.
 */
export function svd(a: Matrix): Svd {
  const { rows: m, cols: n } = shape(a);
  const u = columns(a, m, n);
  const v = Array.from({ length: n }, (_, j) =>
    Float64Array.from({ length: n }, (_, i) => (i === j ? 1 : 0)),
  );

  for (let sweep = 0; sweep < MAX_SWEEPS; sweep++) {
    let rotated = false;
    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        const up = u[p] ?? new Float64Array(m);
        const uq = u[q] ?? new Float64Array(m);
        const alpha = dot(up, up);
        const beta = dot(uq, uq);
        const gamma = dot(up, uq);
        if (Math.abs(gamma) <= Number.EPSILON * Math.sqrt(alpha * beta) || gamma === 0) continue;
        rotated = true;
        // Rotation angle that zeroes the (p, q) entry of the Gram matrix; t = tan θ, smaller root for stability.
        const zeta = (beta - alpha) / (2 * gamma);
        const t = (zeta >= 0 ? 1 : -1) / (Math.abs(zeta) + Math.sqrt(1 + zeta * zeta));
        const c = 1 / Math.sqrt(1 + t * t);
        const s = c * t;
        for (const [cp, cq] of [
          [up, uq],
          [v[p] ?? new Float64Array(n), v[q] ?? new Float64Array(n)],
        ] as const) {
          for (let i = 0; i < cp.length; i++) {
            const xp = at(cp, i);
            const xq = at(cq, i);
            cp[i] = c * xp - s * xq;
            cq[i] = s * xp + c * xq;
          }
        }
      }
    }
    if (!rotated) break;
  }

  const order = u.map((col, j) => ({ value: Math.sqrt(dot(col, col)), j })).sort((x, y) => y.value - x.value);
  return {
    values: order.map((o) => o.value),
    v: order.map((o) => Array.from(v[o.j] ?? [])),
  };
}

/** Row-major 3×3 product A·B. */
export function multiply3(a: Mat3, b: Mat3): Mat3 {
  const c = (i: number, j: number): number =>
    at(a, 3 * i) * at(b, j) + at(a, 3 * i + 1) * at(b, 3 + j) + at(a, 3 * i + 2) * at(b, 6 + j);
  return [c(0, 0), c(0, 1), c(0, 2), c(1, 0), c(1, 1), c(1, 2), c(2, 0), c(2, 1), c(2, 2)];
}

/** Determinant of a row-major 3×3 matrix (cofactor expansion along the first row). */
export function det3(m: Mat3): number {
  const [a, b, c, d, e, f, g, h, i] = m;
  return a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
}

/**
 * Inverse of a row-major 3×3 matrix: adj(M) / det(M).
 *
 * @throws DegenerateError when |det(M)| / ∏‖rowᵢ‖ ≤ RANK_TOLERANCE. That ratio is 1 for orthogonal rows and 0 for
 * singular M (Hadamard's inequality), and unlike a test against the largest entry it does not misfire when the
 * rows have wildly different units, as px → axis matrices do.
 */
export function invert3(m: Mat3): Mat3 {
  const [a, b, c, d, e, f, g, h, i] = m;
  const det = det3(m);
  const rowNorms = Math.hypot(a, b, c) * Math.hypot(d, e, f) * Math.hypot(g, h, i);
  if (!(Math.abs(det) > RANK_TOLERANCE * rowNorms)) throw new DegenerateError('invert3: matrix is singular');
  const k = 1 / det;
  return [
    (e * i - f * h) * k,
    (c * h - b * i) * k,
    (b * f - c * e) * k,
    (f * g - d * i) * k,
    (a * i - c * g) * k,
    (c * d - a * f) * k,
    (d * h - e * g) * k,
    (b * g - a * h) * k,
    (a * e - b * d) * k,
  ];
}

/** Applies a homogeneous 2-D transform: `[x, y, 1] ↦ M·[x, y, 1]ᵀ`, divided by its third component. */
export function applyHomogeneous(m: Mat3, [x, y]: Vec2): Vec2 {
  const w = m[6] * x + m[7] * y + m[8];
  return [(m[0] * x + m[1] * y + m[2]) / w, (m[3] * x + m[4] * y + m[5]) / w];
}

/** Euclidean norm of column j of A, scaled against overflow (unlike `Math.hypot(...)`, any number of rows). */
export function columnNorm(a: Matrix, j: number): number {
  let scale = 0;
  for (const row of a) scale = Math.max(scale, Math.abs(at(row, j)));
  if (!(scale > 0)) return scale === 0 ? 0 : Number.NaN;
  let sum = 0;
  for (const row of a) sum += (at(row, j) / scale) ** 2;
  return scale * Math.sqrt(sum);
}

/**
 * {@link lstsq} with every column of A scaled to unit norm first and the solution scaled back, as
 * `numpy.polyfit` does: for bases such as 1, x, …, x⁹ whose column norms span many decades, the rank test then
 * judges the directions of the columns rather than their sizes.
 */
export function lstsqScaled(a: Matrix, b: readonly number[]): number[] {
  const { cols } = shape(a);
  const norms = Array.from({ length: cols }, (_, j) => columnNorm(a, j) || 1);
  return lstsq(
    a.map((row) => row.map((v, j) => v / at(norms, j))),
    b,
  ).map((x, j) => x / at(norms, j));
}
