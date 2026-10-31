import { MODELS } from './models/index.ts';
import { toSpace } from './space.ts';
import { aiccOf, scaleOf } from './stats.ts';
import { oscillates } from './warnings.ts';
import type { FitData, FitHooks, FitResult, FitSpaces, FitWarning, ModelFit, ModelSpec } from './types.ts';

/**
 * Data values → fit-space data sorted by u. Points without a finite position in fit space (y ≤ 0 on a log
 * axis, which a calibrated point cannot have) are dropped.
 */
export function prepareData(x: readonly number[], y: readonly number[], space: FitSpaces): FitData {
  const rows = x
    .map((xi, i) => {
      const yi = y[i] ?? Number.NaN;
      return { x: xi, y: yi, u: toSpace(xi, space.x), v: toSpace(yi, space.y) };
    })
    .filter(
      (r) => Number.isFinite(r.u) && Number.isFinite(r.v) && Number.isFinite(r.x) && Number.isFinite(r.y),
    )
    .sort((a, b) => a.u - b.u);
  return {
    space,
    x: rows.map((r) => r.x),
    y: rows.map((r) => r.y),
    u: rows.map((r) => r.u),
    v: rows.map((r) => r.v),
  };
}

/** Fewest points any model is fitted to. */
export const MIN_POINTS = 3;

/**
 * Fits one model to prepared data and scores it: R² and RMSE of v (fit space, so log10 units on a log y axis),
 * AICc = n·ln(RSS/n) + 2k + 2k(k+1)/(n−k−1), the domain [min x, max x] of the fitted points, and warnings.
 * Null when the model does not apply (a power law with x ≤ 0, a pole in a rational, too few points: n ≤ k + 1).
 */
export function fitPrepared(data: FitData, spec: ModelSpec, hooks: FitHooks = {}): FitResult | null {
  const n = data.u.length;
  if (n < MIN_POINTS) return null;
  const model = MODELS[spec.model];
  const tick = (): void => hooks.tick?.(0);
  const fit: ModelFit | null = model.fit(data, spec, tick);
  if (fit === null || !(n > fit.k + 1)) return null;
  const predicted = data.x.map((x) => toSpace(model.evaluate(fit.params, x, data.space), data.space.y));
  let rss = 0;
  predicted.forEach((p, i) => {
    rss += (p - (data.v[i] ?? 0)) ** 2;
  });
  if (!Number.isFinite(rss)) return null;
  const mean = data.v.reduce((s, v) => s + v, 0) / n;
  const tss = data.v.reduce((s, v) => s + (v - mean) ** 2, 0);
  const result = {
    model: spec.model,
    params: fit.params,
    space: data.space,
    domain: [data.x.reduce((a, b) => Math.min(a, b)), data.x.reduce((a, b) => Math.max(a, b))] as const,
    stats: {
      n,
      r2: tss > 0 ? 1 - rss / tss : rss === 0 ? 1 : 0,
      rmse: Math.sqrt(rss / n),
      aicc: aiccOf(rss, n, fit.k, scaleOf(data.v)),
    },
    k: fit.k,
    warnings: [] as FitWarning[],
  };
  if (oscillates(result, data)) result.warnings.push('oscillation');
  return result;
}

/** {@link fitPrepared} on data values. */
export function fitModel(
  x: readonly number[],
  y: readonly number[],
  space: FitSpaces,
  spec: ModelSpec,
  hooks: FitHooks = {},
): FitResult | null {
  return fitPrepared(prepareData(x, y, space), spec, hooks);
}
