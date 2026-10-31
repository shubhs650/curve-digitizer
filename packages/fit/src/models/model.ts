import { levenbergMarquardt } from '@cd/math';
import { fromSpace, toSpace, toSpaceDerivative } from '../space.ts';
import type { CodeForm } from '../codegen/form.ts';
import type { FitData, FitParams, FitSpaces, ModelFit, ModelId, ModelSpec } from '../types.ts';

/** One entry of the model registry. */
export interface FitModel {
  readonly id: ModelId;
  /** Short name for the model picker. */
  readonly label: string;
  /** y at data x (NaN where the model is undefined, e.g. x ≤ 0 for a power law). */
  readonly evaluate: (params: FitParams, x: number, space: FitSpaces) => number;
  /** The least-squares fit in fit space, or null when the model does not apply to this data. */
  readonly fit: (data: FitData, spec: ModelSpec, tick: () => void) => ModelFit | null;
  /** Human-readable name of a fitted instance, e.g. "Polynomial, degree 3". */
  readonly describe: (params: FitParams) => string;
  /** The fitted instance in the form the code generators write (codegen/form.ts). */
  readonly form: (params: FitParams) => CodeForm;
}

/**
 * A model whose parameters act on fit-space coordinates: v = g(θ, u) with u = Tx(x), v = Ty(y), so
 * y = Ty⁻¹(g(θ, Tx(x))). Polynomials, rationals, splines and piecewise lines are of this kind: on log axes they
 * are shapes on the log paper.
 */
export function shapeEvaluate(g: (params: FitParams, u: number) => number) {
  return (params: FitParams, x: number, space: FitSpaces): number =>
    fromSpace(g(params, toSpace(x, space.x)), space.y);
}

/**
 * A closed-form law y = f(θ, x) in data units (power, exponential, logarithmic). It is fitted where the points
 * were measured, in fit space: minimise Σ (Ty(f(θ, xᵢ)) − vᵢ)² by Levenberg–Marquardt from `start`, with
 * ∂/∂θ Ty(f) = Ty′(f)·∂f/∂θ.
 */
export interface ClosedForm {
  readonly f: (theta: readonly number[], x: number) => number;
  readonly gradient: (theta: readonly number[], x: number) => number[];
  readonly names: readonly string[];
}

export function fitClosedForm(
  form: ClosedForm,
  data: FitData,
  start: readonly number[] | null,
): ModelFit | null {
  if (start === null || !start.every(Number.isFinite)) return null;
  const { x, v, space } = data;
  try {
    const result = levenbergMarquardt(
      {
        residuals: (theta) => x.map((xi, i) => toSpace(form.f(theta, xi), space.y) - (v[i] ?? 0)),
        jacobian: (theta) =>
          x.map((xi) => {
            const d = toSpaceDerivative(form.f(theta, xi), space.y);
            return form.gradient(theta, xi).map((g) => d * g);
          }),
      },
      start,
    );
    if (!result.params.every(Number.isFinite)) return null;
    return {
      params: Object.fromEntries(form.names.map((name, i) => [name, result.params[i] ?? Number.NaN])),
      k: form.names.length,
    };
  } catch {
    return null;
  }
}

/** Least-squares line q ≈ c₀ + c₁·p, or null when p has no spread. */
export function line(p: readonly number[], q: readonly number[]): readonly [number, number] | null {
  const n = p.length;
  const mp = p.reduce((s, a) => s + a, 0) / n;
  const mq = q.reduce((s, a) => s + a, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    const dp = (p[i] ?? 0) - mp;
    sxx += dp * dp;
    sxy += dp * ((q[i] ?? 0) - mq);
  }
  if (!(sxx > 0)) return null;
  const slope = sxy / sxx;
  return [mq - slope * mp, slope];
}

export function format(value: number): string {
  return Number.isFinite(value) ? value.toPrecision(4) : String(value);
}
