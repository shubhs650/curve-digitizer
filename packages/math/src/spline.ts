import { lstsq, type Matrix } from './linalg.ts';

// Piecewise interpolants on sorted knots t₀ < t₁ < … < t_{K−1} with values v. Outside [t₀, t_{K−1}] each one
// continues the polynomial of its end interval, as SciPy's CubicSpline / PchipInterpolator / numpy-style linear
// extrapolation do; callers flag such queries as extrapolated.

function at(a: ArrayLike<number>, i: number): number {
  return a[i] ?? Number.NaN;
}

function checkKnots(t: readonly number[], v: readonly number[]): void {
  if (t.length < 2) throw new RangeError('A spline needs at least two knots');
  if (t.length !== v.length) throw new RangeError('Knots and values differ in length');
  for (let i = 1; i < t.length; i++) {
    if (!(at(t, i) > at(t, i - 1))) throw new RangeError('Knots must be strictly increasing');
  }
}

/** Index i of the interval [tᵢ, tᵢ₊₁] holding u, clamped to the first and last interval outside the knots. */
export function knotInterval(t: readonly number[], u: number): number {
  let lo = 0;
  let hi = t.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (at(t, mid) <= u) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * Second derivatives Mᵢ of the natural cubic spline through (tᵢ, vᵢ): M₀ = M_{K−1} = 0 and, for 0 < i < K−1,
 * hᵢ₋₁·Mᵢ₋₁ + 2(hᵢ₋₁ + hᵢ)·Mᵢ + hᵢ·Mᵢ₊₁ = 6[(vᵢ₊₁ − vᵢ)/hᵢ − (vᵢ − vᵢ₋₁)/hᵢ₋₁], hᵢ = tᵢ₊₁ − tᵢ, solved by the
 * Thomas algorithm (the system is strictly diagonally dominant).
 */
export function naturalSplineSecondDerivatives(t: readonly number[], v: readonly number[]): number[] {
  checkKnots(t, v);
  const k = t.length;
  const m = new Array<number>(k).fill(0);
  if (k < 3) return m;
  const inner = k - 2;
  const diag = new Float64Array(inner);
  const upper = new Float64Array(inner);
  const rhs = new Float64Array(inner);
  for (let j = 0; j < inner; j++) {
    const i = j + 1;
    const h0 = at(t, i) - at(t, i - 1);
    const h1 = at(t, i + 1) - at(t, i);
    diag[j] = 2 * (h0 + h1);
    upper[j] = h1;
    rhs[j] = 6 * ((at(v, i + 1) - at(v, i)) / h1 - (at(v, i) - at(v, i - 1)) / h0);
    if (j > 0) {
      // Eliminate the sub-diagonal entry h0 using the previous (already reduced) row.
      const w = h0 / at(diag, j - 1);
      diag[j] = at(diag, j) - w * at(upper, j - 1);
      rhs[j] = at(rhs, j) - w * at(rhs, j - 1);
    }
  }
  for (let j = inner - 1; j >= 0; j--) {
    const next = j + 1 < inner ? at(m, j + 2) : 0;
    m[j + 1] = (at(rhs, j) - at(upper, j) * next) / at(diag, j);
  }
  return m;
}

/**
 * The cubic spline with knot values v and second derivatives m at u: on [tᵢ, tᵢ₊₁] with h = tᵢ₊₁ − tᵢ,
 * A = (tᵢ₊₁ − u)/h, B = (u − tᵢ)/h, S(u) = A·vᵢ + B·vᵢ₊₁ + [(A³ − A)·Mᵢ + (B³ − B)·Mᵢ₊₁]·h²/6.
 */
export function evalCubicSpline(
  t: readonly number[],
  v: readonly number[],
  m: readonly number[],
  u: number,
): number {
  const i = knotInterval(t, u);
  const h = at(t, i + 1) - at(t, i);
  const a = (at(t, i + 1) - u) / h;
  const b = (u - at(t, i)) / h;
  return (
    a * at(v, i) +
    b * at(v, i + 1) +
    (((a * a * a - a) * at(m, i) + (b * b * b - b) * at(m, i + 1)) * h * h) / 6
  );
}

/**
 * Knot slopes S′(tᵢ) of the natural cubic spline through (t, v), so it can be written as the cubic Hermite
 * interpolant {@link evalHermite} (one form for every exported spline): with δᵢ = (vᵢ₊₁ − vᵢ)/hᵢ,
 * S′(tᵢ) = δᵢ − hᵢ(2Mᵢ + Mᵢ₊₁)/6 for i < K−1 and S′(t_{K−1}) = δ_{K−2} + h_{K−2}(M_{K−2} + 2M_{K−1})/6.
 */
export function naturalSplineSlopes(t: readonly number[], v: readonly number[]): number[] {
  const m = naturalSplineSecondDerivatives(t, v);
  const k = t.length;
  return t.map((_, i) => {
    const j = Math.min(i, k - 2);
    const h = at(t, j + 1) - at(t, j);
    const delta = (at(v, j + 1) - at(v, j)) / h;
    return i < k - 1
      ? delta - (h * (2 * at(m, j) + at(m, j + 1))) / 6
      : delta + (h * (at(m, j) + 2 * at(m, j + 1))) / 6;
  });
}

/** The natural cubic spline through (t, v) at u: {@link evalCubicSpline} with {@link naturalSplineSecondDerivatives}. */
export function naturalSpline(t: readonly number[], v: readonly number[], u: number): number {
  return evalCubicSpline(t, v, naturalSplineSecondDerivatives(t, v), u);
}

function sign(x: number): number {
  return x > 0 ? 1 : x < 0 ? -1 : 0;
}

/**
 * Knot slopes of the monotone piecewise cubic Hermite interpolant (PCHIP; Fritsch & Carlson 1980, as in
 * `scipy.interpolate.PchipInterpolator`). With secants δᵢ = (vᵢ₊₁ − vᵢ)/hᵢ: an interior slope is 0 where δᵢ₋₁
 * and δᵢ differ in sign or either is 0, else the weighted harmonic mean
 * (w₁ + w₂)/dᵢ = w₁/δᵢ₋₁ + w₂/δᵢ with w₁ = 2hᵢ + hᵢ₋₁, w₂ = hᵢ + 2hᵢ₋₁. End slopes use the three-point
 * formula d₀ = [(2h₀ + h₁)δ₀ − h₀δ₁]/(h₀ + h₁), set to 0 if its sign differs from δ₀ and to 3δ₀ if δ₀, δ₁ differ
 * in sign and |d₀| > 3|δ₀| (likewise at the other end). Two knots give the straight line.
 */
export function pchipSlopes(t: readonly number[], v: readonly number[]): number[] {
  checkKnots(t, v);
  const k = t.length;
  const h = Array.from({ length: k - 1 }, (_, i) => at(t, i + 1) - at(t, i));
  const delta = h.map((hi, i) => (at(v, i + 1) - at(v, i)) / hi);
  if (k === 2) return [at(delta, 0), at(delta, 0)];
  const d = new Array<number>(k).fill(0);
  for (let i = 1; i < k - 1; i++) {
    const d0 = at(delta, i - 1);
    const d1 = at(delta, i);
    if (sign(d0) * sign(d1) <= 0) continue;
    const w1 = 2 * at(h, i) + at(h, i - 1);
    const w2 = at(h, i) + 2 * at(h, i - 1);
    d[i] = (w1 + w2) / (w1 / d0 + w2 / d1);
  }
  const edge = (h0: number, h1: number, m0: number, m1: number): number => {
    const e = ((2 * h0 + h1) * m0 - h0 * m1) / (h0 + h1);
    if (sign(e) !== sign(m0)) return 0;
    if (sign(m0) !== sign(m1) && Math.abs(e) > 3 * Math.abs(m0)) return 3 * m0;
    return e;
  };
  d[0] = edge(at(h, 0), at(h, 1), at(delta, 0), at(delta, 1));
  d[k - 1] = edge(at(h, k - 2), at(h, k - 3), at(delta, k - 2), at(delta, k - 3));
  return d;
}

/**
 * The cubic Hermite interpolant with knot values v and slopes d at u: on [tᵢ, tᵢ₊₁], s = (u − tᵢ)/h,
 * H(u) = h₀₀(s)·vᵢ + h₁₀(s)·h·dᵢ + h₀₁(s)·vᵢ₊₁ + h₁₁(s)·h·dᵢ₊₁ with the Hermite basis
 * h₀₀ = 2s³ − 3s² + 1, h₁₀ = s³ − 2s² + s, h₀₁ = −2s³ + 3s², h₁₁ = s³ − s².
 */
export function evalHermite(
  t: readonly number[],
  v: readonly number[],
  d: readonly number[],
  u: number,
): number {
  const i = knotInterval(t, u);
  const h = at(t, i + 1) - at(t, i);
  const s = (u - at(t, i)) / h;
  const s2 = s * s;
  const s3 = s2 * s;
  return (
    (2 * s3 - 3 * s2 + 1) * at(v, i) +
    (s3 - 2 * s2 + s) * h * at(d, i) +
    (-2 * s3 + 3 * s2) * at(v, i + 1) +
    (s3 - s2) * h * at(d, i + 1)
  );
}

/** PCHIP through (t, v) at u: {@link evalHermite} with {@link pchipSlopes}. */
export function pchip(t: readonly number[], v: readonly number[], u: number): number {
  return evalHermite(t, v, pchipSlopes(t, v), u);
}

/** Piecewise linear interpolation through (t, v) at u, the end segments extended outside the knots. */
export function linearSpline(t: readonly number[], v: readonly number[], u: number): number {
  const i = knotInterval(t, u);
  const s = (u - at(t, i)) / (at(t, i + 1) - at(t, i));
  return at(v, i) + s * (at(v, i + 1) - at(v, i));
}

/**
 * Least-squares knot values on fixed knots t for the natural cubic spline (`kind: 'natural'`) or the linear
 * spline (`'linear'`): both are linear in their knot values, S(u) = Σⱼ vⱼ·Bⱼ(u) where Bⱼ is the spline through
 * the j-th unit vector, so v minimises ‖B·v − y‖ with Bᵢⱼ = Bⱼ(xᵢ).
 *
 * @throws DegenerateError when some interval holds too little data to pin its values.
 */
export function lsqSplineValues(
  t: readonly number[],
  x: readonly number[],
  y: readonly number[],
  kind: 'natural' | 'linear',
): number[] {
  const k = t.length;
  const unit = (j: number): number[] => Array.from({ length: k }, (_, i) => (i === j ? 1 : 0));
  const basisM =
    kind === 'natural' ? Array.from({ length: k }, (_, j) => naturalSplineSecondDerivatives(t, unit(j))) : [];
  const design: Matrix = x.map((u) => {
    const row = new Array<number>(k).fill(0);
    const i = knotInterval(t, u);
    const h = at(t, i + 1) - at(t, i);
    const b = (u - at(t, i)) / h;
    const a = 1 - b;
    row[i] = a;
    row[i + 1] = b;
    if (kind === 'natural') {
      const ca = ((a * a * a - a) * h * h) / 6;
      const cb = ((b * b * b - b) * h * h) / 6;
      for (let j = 0; j < k; j++) {
        const mj = basisM[j] ?? [];
        row[j] = at(row, j) + ca * at(mj, i) + cb * at(mj, i + 1);
      }
    }
    return row;
  });
  return lstsq(design, [...y]);
}
