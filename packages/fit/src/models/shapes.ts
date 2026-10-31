import {
  DegenerateError,
  evalCubicSpline,
  evalHermite,
  levenbergMarquardt,
  linearSpline,
  lsqSplineValues,
  lstsqScaled,
  naturalSplineSecondDerivatives,
  naturalSplineSlopes,
  pchipSlopes,
  polyfit,
  polyval,
} from '@cd/math';
import { vector } from '../params.ts';
import { toSpace } from '../space.ts';
import type { FitData, FitParams, ModelFit, ModelSpec } from '../types.ts';
import { type FitModel, shapeEvaluate } from './model.ts';
import { aiccOf, rssOf, scaleOf } from '../stats.ts';

// Shapes in fit space, v = g(u): on log axes they are drawn on the log paper. Polynomial and rational
// coefficients are for raw u (no centring), so the exported formulas are the familiar ones.

function tryFit<T>(f: () => T): T | null {
  try {
    return f();
  } catch (e) {
    if (e instanceof DegenerateError || e instanceof RangeError) return null;
    throw e;
  }
}

/** v = c₀ + c₁·u + … + c_d·u^d; params `{ c }`. */
export const polynomial: FitModel = {
  id: 'poly',
  label: 'Polynomial',
  evaluate: shapeEvaluate((p, u) => polyval(vector(p, 'c'), u)),
  fit(data: FitData, spec: ModelSpec): ModelFit | null {
    if (spec.model !== 'poly' || spec.degree < 1 || spec.degree > 9) return null;
    const c = tryFit(() => polyfit(data.u, data.v, spec.degree));
    return c && { params: { c }, k: c.length };
  },
  form: (p) => ({ kind: 'poly', c: vector(p, 'c') }),
  describe: (p) => `Polynomial, degree ${String(vector(p, 'c').length - 1)}`,
};

function rationalAt(p: readonly number[], q: readonly number[], u: number): number {
  return polyval(p, u) / (1 + u * polyval(q, u));
}

/**
 * v = P(u)/Q(u) with P = p₀ + … + p_m·u^m and Q = 1 + q₁·u + … + q_n·uⁿ; params `{ p, q }` (q without its
 * leading 1). Started from the linearised system P(uᵢ) − vᵢ·(Q(uᵢ) − 1) = vᵢ, then refined by
 * Levenberg–Marquardt on the true residuals. Rejected when Q vanishes in the data's u range (a pole).
 */
export const rational: FitModel = {
  id: 'rational',
  label: 'Rational',
  evaluate: shapeEvaluate((p, u) => rationalAt(vector(p, 'p'), vector(p, 'q'), u)),
  fit(data: FitData, spec: ModelSpec): ModelFit | null {
    if (spec.model !== 'rational' || spec.num < 0 || spec.den < 1) return null;
    const { u, v } = data;
    const m = spec.num + 1;
    const n = spec.den;
    const split = (theta: readonly number[]): [number[], number[]] => [theta.slice(0, m), theta.slice(m)];
    const start = tryFit(() =>
      lstsqScaled(
        u.map((ui, i) => [
          ...Array.from({ length: m }, (_, j) => ui ** j),
          ...Array.from({ length: n }, (_, j) => -(v[i] ?? 0) * ui ** (j + 1)),
        ]),
        v,
      ),
    );
    if (start === null) return null;
    const result = tryFit(() =>
      levenbergMarquardt(
        {
          residuals: (theta) => {
            const [pp, qq] = split(theta);
            return u.map((ui, i) => rationalAt(pp, qq, ui) - (v[i] ?? 0));
          },
          jacobian: (theta) => {
            const [pp, qq] = split(theta);
            return u.map((ui) => {
              const q = 1 + ui * polyval(qq, ui);
              const value = polyval(pp, ui) / q;
              return [
                ...Array.from({ length: m }, (_, j) => ui ** j / q),
                ...Array.from({ length: n }, (_, j) => (-value * ui ** (j + 1)) / q),
              ];
            });
          },
        },
        start,
      ),
    );
    if (result === null) return null;
    const [p, q] = split(result.params);
    if (hasPole(q, u[0] ?? 0, u[u.length - 1] ?? 0)) return null;
    return { params: { p, q }, k: m + n };
  },
  form: (p) => ({ kind: 'rational', p: vector(p, 'p'), q: vector(p, 'q') }),
  describe: (p) => `Rational, degree ${String(vector(p, 'p').length - 1)}/${String(vector(p, 'q').length)}`,
};

/** Q(u) = 1 + u·Σ qⱼ·u^(j−1) changes sign or comes within 1e-9 of 0 on a fine grid over [lo, hi]. */
function hasPole(q: readonly number[], lo: number, hi: number): boolean {
  const steps = 1024;
  let sign = 0;
  for (let i = 0; i <= steps; i++) {
    const u = lo + ((hi - lo) * i) / steps;
    const value = 1 + u * polyval(q, u);
    if (!(Math.abs(value) > 1e-9)) return true;
    const s = Math.sign(value);
    if (sign !== 0 && s !== sign) return true;
    sign = s;
  }
  return false;
}

/** Most knots tried by the automatic knot count. */
export const MAX_AUTO_KNOTS = 16;

/** K knots at evenly spaced quantiles of the (sorted) u values, merged where they coincide. */
export function quantileKnots(u: readonly number[], count: number): number[] {
  const n = u.length;
  const knots: number[] = [];
  for (let i = 0; i < count; i++) {
    const pos = ((n - 1) * i) / (count - 1);
    const lo = Math.floor(pos);
    const t = pos - lo;
    const value = (u[lo] ?? 0) * (1 - t) + (u[Math.min(lo + 1, n - 1)] ?? 0) * t;
    if (knots.length === 0 || value > (knots[knots.length - 1] ?? 0)) knots.push(value);
  }
  return knots;
}

type KnotFitter = (knots: readonly number[], data: FitData) => number[] | null;

/**
 * Fits knot values for each knot count from 3 to 16 (or the given count) and keeps the count with the lowest
 * AICc. The knots sit at quantiles by rule, so their K values are estimated, plus one for the count when it was
 * chosen automatically. `refine` then polishes the winner's values (PCHIP, which is not linear in them).
 */
function fitKnots(
  data: FitData,
  spec: ModelSpec,
  shape: (p: FitParams, u: number) => number,
  fitValues: KnotFitter,
  tick: () => void,
  refine: (knots: readonly number[], values: readonly number[]) => number[] = (_, values) => [...values],
): ModelFit | null {
  if (spec.model !== 'spline' && spec.model !== 'pchip') return null;
  const n = data.u.length;
  const requested = spec.knots ?? 'auto';
  const counts =
    requested === 'auto'
      ? Array.from({ length: Math.max(0, Math.min(MAX_AUTO_KNOTS, n - 2) - 2) }, (_, i) => i + 3)
      : [requested];
  let best: { knots: number[]; values: number[]; aicc: number } | null = null;
  for (const count of counts) {
    tick();
    if (!(Number.isInteger(count) && count >= 3 && count <= n - 2)) continue;
    const knots = quantileKnots(data.u, count);
    if (knots.length < 3) continue;
    const values = fitValues(knots, data);
    if (values === null) continue;
    const k = knots.length + (requested === 'auto' ? 1 : 0);
    if (!(n > k + 1)) continue;
    const score = aiccOf(rssOf(data, shape, { knots, values }), n, k, scaleOf(data.v));
    if (best === null || score < best.aicc) best = { knots, values, aicc: score };
  }
  if (best === null) return null;
  // Picking the count from the data is one more estimate (see the AICc note in recommend.ts).
  const k = best.knots.length + (requested === 'auto' ? 1 : 0);
  return { params: { knots: best.knots, values: refine(best.knots, best.values) }, k };
}

const splineShape = (p: FitParams, u: number): number => {
  const t = vector(p, 'knots');
  const v = vector(p, 'values');
  return evalCubicSpline(t, v, naturalSplineSecondDerivatives(t, v), u);
};

/**
 * Natural cubic spline on knots at quantiles of u, knot values by linear least squares; params
 * `{ knots, values }` in fit space.
 */
export const spline: FitModel = {
  id: 'spline',
  label: 'Cubic spline',
  evaluate: shapeEvaluate(splineShape),
  fit: (data, spec, tick) =>
    fitKnots(
      data,
      spec,
      splineShape,
      (knots, d) => tryFit(() => lsqSplineValues(knots, d.u, d.v, 'natural')),
      tick,
    ),
  form: (p) => ({
    kind: 'hermite',
    knots: vector(p, 'knots'),
    values: vector(p, 'values'),
    slopes: naturalSplineSlopes(vector(p, 'knots'), vector(p, 'values')),
  }),
  describe: (p) => `Cubic spline, ${String(vector(p, 'knots').length)} knots`,
};

const pchipShape = (p: FitParams, u: number): number => {
  const t = vector(p, 'knots');
  const v = vector(p, 'values');
  return evalHermite(t, v, pchipSlopes(t, v), u);
};

/**
 * Monotone cubic (PCHIP) on knots at quantiles of u. PCHIP is not linear in its knot values: the knot count is
 * chosen with the least-squares piecewise line's values, then the winner's values are refined by
 * Levenberg–Marquardt with a forward-difference Jacobian.
 */
export const pchipModel: FitModel = {
  id: 'pchip',
  label: 'Monotone spline (PCHIP)',
  evaluate: shapeEvaluate(pchipShape),
  fit: (data, spec, tick) =>
    fitKnots(
      data,
      spec,
      pchipShape,
      (knots, d) => linearSplineLsq(knots, d.u, d.v)?.values ?? null,
      tick,
      (knots, start) => {
        const residuals = (values: readonly number[]): number[] => {
          const slopes = pchipSlopes(knots, values);
          return data.u.map((u, i) => evalHermite(knots, values, slopes, u) - (data.v[i] ?? 0));
        };
        const scale = Math.max(...start.map(Math.abs), 1e-300);
        const result = tryFit(() =>
          levenbergMarquardt(
            {
              residuals,
              jacobian: (values) => {
                const r0 = residuals(values);
                const columns = values.map((_, j) => {
                  const h = 1e-7 * Math.max(Math.abs(values[j] ?? 0), scale);
                  const shifted = values.map((x, k) => (k === j ? x + h : x));
                  return residuals(shifted).map((r, i) => (r - (r0[i] ?? 0)) / h);
                });
                return data.u.map((_, i) => columns.map((c) => c[i] ?? 0));
              },
            },
            start,
          ),
        );
        return result?.params ?? [...start];
      },
    ),
  form: (p) => ({
    kind: 'hermite',
    knots: vector(p, 'knots'),
    values: vector(p, 'values'),
    slopes: pchipSlopes(vector(p, 'knots'), vector(p, 'values')),
  }),
  describe: (p) => `Monotone spline (PCHIP), ${String(vector(p, 'knots').length)} knots`,
};

const piecewiseShape = (p: FitParams, u: number): number =>
  linearSpline(vector(p, 'knots'), vector(p, 'values'), u);

/** Most breakpoints the automatic search places between the ends. */
export const MAX_AUTO_BREAKPOINTS = 10;
const CANDIDATES = 96;

/**
 * Connected straight segments, params `{ knots, values }` in fit space: the ends of the data plus at least one
 * breakpoint. Given breakpoints (data x) are used as they are (k = number of knots). `'auto'` adds breakpoints greedily,
 * each at the best of up to 96 quantile positions, then moves each one to its least-squares position by a
 * golden-section search between its neighbours; it stops when AICc stops falling. A placed breakpoint counts
 * three parameters: its value, and two for its position, because a position found by search fits noise like
 * about two regular parameters (the change-point likelihood ratio is not χ²₁).
 */
export const piecewise: FitModel = {
  id: 'piecewise',
  label: 'Piecewise linear',
  evaluate: shapeEvaluate(piecewiseShape),
  fit(data: FitData, spec: ModelSpec, tick: () => void): ModelFit | null {
    if (spec.model !== 'piecewise') return null;
    const { u } = data;
    const lo = u[0] ?? 0;
    const hi = u[u.length - 1] ?? 0;
    if (!(hi > lo)) return null;
    const requested = spec.breakpoints ?? 'auto';
    if (requested !== 'auto') {
      const inner = requested
        .map((x) => toSpace(x, data.space.x))
        .filter((b) => b > lo && b < hi)
        .sort((a, b) => a - b);
      const knots = [lo, ...inner.filter((b, i) => i === 0 || b > (inner[i - 1] ?? 0)), hi];
      if (knots.length < 3) return null;
      const values = tryFit(() => lsqSplineValues(knots, u, data.v, 'linear'));
      return values && { params: { knots, values }, k: knots.length };
    }
    return autoPiecewise(data, tick);
  },
  form: (p) => ({ kind: 'linear', knots: vector(p, 'knots'), values: vector(p, 'values') }),
  describe: (p) => `Piecewise linear, ${String(Math.max(0, vector(p, 'knots').length - 1))} segments`,
};

/**
 * Least-squares values of the linear spline on `knots` through sorted (u, v), with its RSS, from the normal
 * equations: each point touches two neighbouring knots with weights a = (tᵢ₊₁ − u)/h, b = (u − tᵢ)/h, so BᵀB is
 * tridiagonal and solved by the Thomas algorithm in O(n + K). The breakpoint search calls this thousands of
 * times; the chosen knots are refitted by QR. Null when a knot has no data around it (singular system).
 */
export function linearSplineLsq(
  knots: readonly number[],
  u: readonly number[],
  v: readonly number[],
): { values: number[]; rss: number } | null {
  const k = knots.length;
  const diag = new Float64Array(k);
  const off = new Float64Array(k);
  const rhs = new Float64Array(k);
  let i = 0;
  u.forEach((ui, j) => {
    while (i < k - 2 && ui >= (knots[i + 1] ?? 0)) i++;
    const t0 = knots[i] ?? 0;
    const h = (knots[i + 1] ?? 0) - t0;
    const b = (ui - t0) / h;
    const a = 1 - b;
    const vj = v[j] ?? 0;
    diag[i] = (diag[i] ?? 0) + a * a;
    diag[i + 1] = (diag[i + 1] ?? 0) + b * b;
    off[i] = (off[i] ?? 0) + a * b;
    rhs[i] = (rhs[i] ?? 0) + a * vj;
    rhs[i + 1] = (rhs[i + 1] ?? 0) + b * vj;
  });
  // Thomas algorithm on the symmetric tridiagonal system (diag, off).
  const c = new Float64Array(k);
  const d = new Float64Array(k);
  for (let r = 0; r < k; r++) {
    const sub = r > 0 ? (off[r - 1] ?? 0) : 0;
    const pivot = (diag[r] ?? 0) - (r > 0 ? sub * (c[r - 1] ?? 0) : 0);
    if (!(Math.abs(pivot) > 1e-12 * ((diag[r] ?? 0) + 1e-300))) return null;
    c[r] = (off[r] ?? 0) / pivot;
    d[r] = ((rhs[r] ?? 0) - (r > 0 ? sub * (d[r - 1] ?? 0) : 0)) / pivot;
  }
  const values = new Array<number>(k);
  for (let r = k - 1; r >= 0; r--)
    values[r] = (d[r] ?? 0) - (r < k - 1 ? (c[r] ?? 0) * (values[r + 1] ?? 0) : 0);
  let rss = 0;
  i = 0;
  u.forEach((ui, j) => {
    while (i < k - 2 && ui >= (knots[i + 1] ?? 0)) i++;
    const t0 = knots[i] ?? 0;
    const b = (ui - t0) / ((knots[i + 1] ?? 0) - t0);
    const r = (values[i] ?? 0) * (1 - b) + (values[i + 1] ?? 0) * b - (v[j] ?? 0);
    rss += r * r;
  });
  return { values, rss };
}

function autoPiecewise(data: FitData, tick: () => void): ModelFit | null {
  const { u, v } = data;
  const n = u.length;
  const lo = u[0] ?? 0;
  const hi = u[n - 1] ?? 0;
  const score = (knots: readonly number[]): { values: number[]; rss: number } | null =>
    linearSplineLsq(knots, u, v);
  const kOf = (knots: readonly number[]): number => knots.length + 2 * (knots.length - 2);
  const candidates = quantileKnots(u, Math.min(CANDIDATES, n - 2) + 2).slice(1, -1);
  // A piecewise line needs at least one breakpoint; without one it is the straight line under another name.
  let knots: number[] | null = null;
  let current: { values: number[]; rss: number } | null = null;
  let bestAicc = Infinity;
  for (let round = 0; round < MAX_AUTO_BREAKPOINTS; round++) {
    tick();
    const base: readonly number[] = knots ?? [lo, hi];
    if (!(n > kOf(base) + 2 + 1)) break;
    let next: { knots: number[]; fit: { values: number[]; rss: number } } | null = null;
    for (const c of candidates) {
      if (base.includes(c)) continue;
      const trial: number[] = [...base, c].sort((a, b) => a - b);
      const fit = score(trial);
      if (fit !== null && (next === null || fit.rss < next.fit.rss)) next = { knots: trial, fit };
    }
    if (next === null) break;
    const refined = refineBreakpoints(next.knots, score, tick);
    const refinedFit = score(refined);
    const chosen: { knots: number[]; fit: { values: number[]; rss: number } } =
      refinedFit !== null && refinedFit.rss <= next.fit.rss ? { knots: refined, fit: refinedFit } : next;
    const aicc = aiccOf(chosen.fit.rss, n, kOf(chosen.knots), scaleOf(v));
    if (knots !== null && !(aicc < bestAicc)) break;
    knots = chosen.knots;
    current = chosen.fit;
    bestAicc = aicc;
  }
  if (knots === null || current === null) return null;
  const values = tryFit(() => lsqSplineValues(knots, u, v, 'linear')) ?? current.values;
  return { params: { knots, values }, k: kOf(knots) };
}

const GOLDEN = (Math.sqrt(5) - 1) / 2;

/** Coordinate descent: each inner breakpoint moves to the RSS minimum between its neighbours (3 sweeps). */
function refineBreakpoints(
  start: readonly number[],
  score: (knots: readonly number[]) => { rss: number } | null,
  tick: () => void,
): number[] {
  const knots = [...start];
  for (let sweep = 0; sweep < 3; sweep++) {
    for (let i = 1; i < knots.length - 1; i++) {
      tick();
      const left = knots[i - 1] ?? 0;
      const right = knots[i + 1] ?? 0;
      const margin = (right - left) * 1e-3;
      const rssAt = (b: number): number => {
        const trial = [...knots];
        trial[i] = b;
        return score(trial)?.rss ?? Infinity;
      };
      let a = left + margin;
      let b = right - margin;
      let c = b - GOLDEN * (b - a);
      let d = a + GOLDEN * (b - a);
      let fc = rssAt(c);
      let fd = rssAt(d);
      for (let it = 0; it < 40 && b - a > 1e-9 * (Math.abs(a) + Math.abs(b) + 1); it++) {
        if (fc < fd) {
          b = d;
          d = c;
          fd = fc;
          c = b - GOLDEN * (b - a);
          fc = rssAt(c);
        } else {
          a = c;
          c = d;
          fc = fd;
          d = a + GOLDEN * (b - a);
          fd = rssAt(d);
        }
      }
      const best = fc < fd ? c : d;
      if (rssAt(best) < rssAt(knots[i] ?? 0)) knots[i] = best;
    }
  }
  return knots;
}
