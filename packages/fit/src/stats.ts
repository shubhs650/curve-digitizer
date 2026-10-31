import { aicc } from '@cd/math';
import type { FitData, FitParams } from './types.ts';

/**
 * Σ (g(uᵢ) − vᵢ)² for a fit-space shape g; NaN predictions make it Infinity so such a fit never wins.
 */
export function rssOf(data: FitData, g: (params: FitParams, u: number) => number, params: FitParams): number {
  let rss = 0;
  data.u.forEach((u, i) => {
    const r = g(params, u) - (data.v[i] ?? 0);
    rss += r * r;
  });
  return Number.isFinite(rss) ? rss : Infinity;
}

/**
 * AICc with RSS floored at n·(1e-9·s)², s = max|v| (or 1): an RMSE that small is round-off and search tolerance,
 * not fit, so exact fits score the same large negative number rather than −∞ and the one with fewer parameters
 * wins the tie.
 */
export function aiccOf(rss: number, n: number, k: number, vScale = 1): number {
  const floor = n * (1e-9 * (vScale > 0 ? vScale : 1)) ** 2;
  return aicc(Math.max(rss, floor), n, k);
}

/** max|v|, the scale {@link aiccOf} floors RSS against. */
export function scaleOf(v: readonly number[]): number {
  let s = 0;
  for (const x of v) s = Math.max(s, Math.abs(x));
  return s;
}
