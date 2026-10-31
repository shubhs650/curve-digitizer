import { MODELS } from './models/index.ts';
import { toSpace } from './space.ts';
import type { FitData, FitResult } from './types.ts';

const SAMPLES = 512;

/**
 * Over-fitting oscillation (docs/PRD.md §4.8): somewhere between the first and last point the fitted curve leaves
 * the band spanned by the nearest two points on each side, widened by 3·RMSE + 2 % of the v range. A smooth fit
 * overshoots its neighbours only by its curvature over one point spacing (≈ 1.5 % of the range for 10 points over
 * a sine hump); a wiggling high-degree polynomial or rational swings well past them.
 */
export function oscillates(
  fit: Pick<FitResult, 'model' | 'params' | 'space' | 'stats'>,
  data: FitData,
): boolean {
  const { u, v } = data;
  const n = u.length;
  if (n < 3) return false;
  const vMin = Math.min(...v);
  const vMax = Math.max(...v);
  const tolerance = 3 * fit.stats.rmse + 0.02 * (vMax - vMin);
  const model = MODELS[fit.model];
  const lo = u[0] ?? 0;
  const hi = u[n - 1] ?? 0;
  let j = 0;
  for (let s = 0; s <= SAMPLES; s++) {
    const us = lo + ((hi - lo) * s) / SAMPLES;
    while (j < n - 2 && (u[j + 1] ?? 0) <= us) j++;
    const x = fit.space.x === 'log' ? 10 ** us : us;
    const value = toSpace(model.evaluate(fit.params, x, fit.space), fit.space.y);
    if (!Number.isFinite(value)) return true;
    let low = Infinity;
    let high = -Infinity;
    for (let i = Math.max(0, j - 1); i <= Math.min(n - 1, j + 2); i++) {
      low = Math.min(low, v[i] ?? 0);
      high = Math.max(high, v[i] ?? 0);
    }
    if (value < low - tolerance || value > high + tolerance) return true;
  }
  return false;
}
