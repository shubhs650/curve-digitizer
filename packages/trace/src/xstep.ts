import type { Raster, Rgb } from '@cd/image';
import { applyHomogeneous, type AxisTypes, type Mat3, toAxis } from '@cd/math';
import { type GuidedTraceOptions, type TraceHooks, traceGuided } from './guided.ts';
import type { Vec2 } from './snap.ts';

// X-step sampling (ARCHITECTURE §8.3, ADR 36). The curve through the start click is traced with the guided
// tracer (both ways to its ends), so crossings, grid lines and gaps are handled as there; then each requested
// X is the point where the traced centreline crosses that X's iso-line, nearest the previous X's point when
// the centreline crosses it more than once (continuity). Working on the traced path rather than on single
// pixel columns also handles tilted scans, where an iso-X line is not a pixel column.

/**
 * A point is an outlier when it lies more than OUTLIER_PX off the chord between its neighbours and more than
 * OUTLIER_RATIO of that chord's length: a smooth curve's sagitta is a small share of the chord (≤ 0.06 on the
 * steep end of `vector-clean`'s power curve at 25 steps), a spike's is not.
 */
const OUTLIER_PX = 10;
const OUTLIER_RATIO = 0.15;

export interface XStepOptions extends Pick<GuidedTraceOptions, 'color' | 'maxGapPx' | 'turnPenalty'> {
  /** A click on the curve. */
  readonly start: Vec2;
  /** Data X values, in the order the points are wanted. */
  readonly xs: readonly number[];
  /** The calibration: image px → axis space. */
  readonly matrix: Mat3;
  readonly axes: AxisTypes;
  /** Minimum deviation from the neighbours' chord that counts as an outlier, px. */
  readonly outlierPx?: number;
}

export interface XStepPoint {
  readonly x: number;
  /** Null where the traced curve does not reach this X. */
  readonly px: Vec2 | null;
  readonly lineWidthPx: number;
  /** Jumps away from its neighbours by more than the threshold (ARCHITECTURE §8.3). */
  readonly outlier: boolean;
}

export interface XStepResult {
  readonly points: readonly XStepPoint[];
  /** The traced centreline the points were taken from. */
  readonly path: readonly Vec2[];
  readonly color: Rgb;
  /** The trace stopped at an ambiguity, so X values beyond it are missing. */
  readonly stoppedAtBranch: boolean;
}

/**
 * Where the polyline `path` crosses axis-space X `u` (through `matrix`), interpolated linearly along the
 * crossing segment; with several crossings, the one nearest `hint`. Null when it never reaches `u`.
 */
export function xAt(
  path: readonly Vec2[],
  matrix: Mat3,
  u: number,
  hint: Vec2 | null,
): { readonly px: Vec2; readonly segment: number } | null {
  let best: { px: Vec2; segment: number } | null = null;
  let bestDistance = Infinity;
  let ua = path[0] === undefined ? NaN : applyHomogeneous(matrix, path[0])[0];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1] as Vec2;
    const b = path[i] as Vec2;
    const ub = applyHomogeneous(matrix, b)[0];
    if (ua !== ub && (ua - u) * (ub - u) <= 0) {
      const t = (u - ua) / (ub - ua);
      const px: Vec2 = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
      const distance = hint === null ? 0 : Math.hypot(px[0] - hint[0], px[1] - hint[1]);
      if (distance < bestDistance) {
        best = { px, segment: i - 1 };
        bestDistance = distance;
        if (hint === null) break;
      }
    }
    ua = ub;
  }
  return best;
}

/** Distance from `p` to the segment a–b. */
function chordDistance(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

/**
 * Outlier flags for X-step points in order (null = missing, skipped): a point more than `minPx` and
 * OUTLIER_RATIO of the chord off the chord between the kept points either side of it. The worst point is
 * flagged first and left out before the others are judged again, so a spike does not also flag its neighbours
 * (whose chords run through it).
 */
export function flagOutliers(points: readonly (Vec2 | null)[], minPx = OUTLIER_PX): boolean[] {
  const flags = points.map(() => false);
  for (;;) {
    const at = points.flatMap((p, i) => (p && !flags[i] ? [i] : []));
    let worst = -1;
    let worstExcess = 0;
    for (let k = 1; k < at.length - 1; k++) {
      const i = at[k] as number;
      const p = points[i] as Vec2;
      const a = points[at[k - 1] as number] as Vec2;
      const b = points[at[k + 1] as number] as Vec2;
      const d = chordDistance(p, a, b);
      const limit = Math.max(minPx, OUTLIER_RATIO * Math.hypot(b[0] - a[0], b[1] - a[1]));
      if (d / limit > Math.max(1, worstExcess)) {
        worst = i;
        worstExcess = d / limit;
      }
    }
    if (worst < 0) return flags;
    flags[worst] = true;
  }
}

/** Samples the curve through `options.start` at each requested data X (ARCHITECTURE §8.3). */
export async function sampleXSteps(
  raster: Raster,
  options: XStepOptions,
  hooks: TraceHooks = {},
): Promise<XStepResult> {
  const { start, xs, matrix, axes } = options;
  const traced = await traceGuided(
    raster,
    {
      start,
      ...(options.color === undefined ? {} : { color: options.color }),
      ...(options.maxGapPx === undefined ? {} : { maxGapPx: options.maxGapPx }),
      ...(options.turnPenalty === undefined ? {} : { turnPenalty: options.turnPenalty }),
    },
    hooks,
  );
  const { path, widths } = traced;
  let hint: Vec2 | null = null;
  const found = xs.map((x) => {
    const u = toAxis(x, axes.x);
    const hit = Number.isFinite(u) ? xAt(path, matrix, u, hint) : null;
    if (hit) hint = hit.px;
    const width = hit ? ((widths[hit.segment] ?? 0) + (widths[hit.segment + 1] ?? 0)) / 2 : 0;
    return { x, px: hit?.px ?? null, lineWidthPx: width };
  });

  const outliers = flagOutliers(
    found.map((p) => p.px),
    options.outlierPx ?? OUTLIER_PX,
  );
  return {
    points: found.map((p, i) => ({ ...p, outlier: outliers[i] ?? false })),
    path,
    color: traced.color,
    stoppedAtBranch: traced.status === 'ambiguous',
  };
}
