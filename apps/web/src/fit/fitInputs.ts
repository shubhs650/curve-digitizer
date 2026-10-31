import type { Dataset, Fit, Graph, Point } from '@cd/core';
import { evaluateFit, type FitResult, type FitSpaces, spaceOfAxis, toSpace } from '@cd/fit';
import { pixelToValue, valueToPixel } from '@cd/math';

/** The points a fit uses, in data units recomputed from `px` (ADR 27), and those it leaves out. */
export interface FitInputs {
  readonly space: FitSpaces;
  readonly x: readonly number[];
  readonly y: readonly number[];
  /** Points marked "exclude from fit", with their values, for the residual plot. */
  readonly excluded: readonly (readonly [number, number])[];
}

/** Fewest included points the panel offers to fit. */
export const MIN_FIT_POINTS = 3;

/** Why a dataset cannot be fitted, or null. */
export function fitBlock(graph: Graph, dataset: Dataset | null): string | null {
  if (dataset === null) return 'Add a dataset and some points to fit.';
  if (graph.calibration === null) return 'Calibrate the graph first: fits are made on calibrated values.';
  if (dataset.mode === 'path') {
    return `${dataset.name} is a path dataset (kept in pick order), so y = f(x) fits do not apply. Switch it to a function dataset in the inspector to fit it.`;
  }
  const n = dataset.points.filter((p) => !p.excludedFromFit).length;
  if (n < MIN_FIT_POINTS) {
    return `Fitting needs at least ${String(MIN_FIT_POINTS)} points that are not excluded; ${dataset.name} has ${String(n)}.`;
  }
  return null;
}

export function fitSpaces(graph: Graph): FitSpaces {
  const c = graph.calibration;
  return { x: spaceOfAxis(c?.xAxis.type ?? 'linear'), y: spaceOfAxis(c?.yAxis.type ?? 'linear') };
}

/** Data value of a point through the graph's calibration (null when uncalibrated). */
export function pointValue(graph: Graph, point: Point): readonly [number, number] | null {
  const c = graph.calibration;
  if (c === null) return null;
  return pixelToValue(c.matrix, { x: c.xAxis.type, y: c.yAxis.type }, point.px);
}

export function fitInputs(graph: Graph, dataset: Dataset): FitInputs {
  const x: number[] = [];
  const y: number[] = [];
  const excluded: (readonly [number, number])[] = [];
  for (const p of dataset.points) {
    const v = pointValue(graph, p);
    if (v === null) continue;
    if (p.excludedFromFit) excluded.push(v);
    else {
      x.push(v[0]);
      y.push(v[1]);
    }
  }
  return { space: fitSpaces(graph), x, y, excluded };
}

/**
 * The stored fit no longer matches the dataset: the points it would use now differ in number or X range, or the
 * axes changed type. Cheap enough to check on every render; a moved point that keeps n and the range is caught
 * by the residual column instead.
 */
export function isStale(fit: Fit, inputs: FitInputs): boolean {
  const n = inputs.x.length;
  if (n !== fit.stats.n) return true;
  if (fit.space.x !== inputs.space.x || fit.space.y !== inputs.space.y) return true;
  const lo = Math.min(...inputs.x);
  const hi = Math.max(...inputs.x);
  const tol = 1e-9 * Math.max(Math.abs(lo), Math.abs(hi), 1e-300);
  return Math.abs(lo - fit.domain[0]) > tol || Math.abs(hi - fit.domain[1]) > tol;
}

/** Residual of a point against a fit, in fit space: y − f(x), or log10(y / f(x)) on a log y axis. */
export function residual(
  fit: Pick<Fit, 'model' | 'params' | 'space' | 'domain'>,
  [x, y]: readonly [number, number],
): number {
  const { y: f } = evaluateFit(fit, x);
  return toSpace(y, fit.space.y) - toSpace(f, fit.space.y);
}

/** Number of segments a fit curve is drawn with. */
const CURVE_SAMPLES = 240;

/** The fit's curve over its domain in image px, through the calibration; empty when uncalibrated. */
export function fitPathPx(
  graph: Graph,
  fit: Pick<Fit, 'model' | 'params' | 'space' | 'domain'>,
): (readonly [number, number])[] {
  const c = graph.calibration;
  if (c === null) return [];
  const axes = { x: c.xAxis.type, y: c.yAxis.type };
  const out: (readonly [number, number])[] = [];
  const [lo, hi] = fit.domain;
  const log = fit.space.x === 'log' && lo > 0;
  for (let i = 0; i <= CURVE_SAMPLES; i++) {
    const t = i / CURVE_SAMPLES;
    const x = log ? 10 ** (Math.log10(lo) + t * (Math.log10(hi) - Math.log10(lo))) : lo + t * (hi - lo);
    const { y } = evaluateFit(fit, x);
    if (!Number.isFinite(y) || (axes.y === 'log10' && !(y > 0))) continue;
    const px = valueToPixel(c.matrix, axes, [x, y]);
    if (Number.isFinite(px[0]) && Number.isFinite(px[1])) out.push(px);
  }
  return out;
}

/** A fit result ready to store for a dataset. */
export function toStoredFit(result: FitResult, datasetId: string, id: string, recommended: boolean): Fit {
  return {
    id,
    datasetId,
    model: result.model,
    space: result.space,
    params: result.params,
    domain: result.domain,
    stats: result.stats,
    recommended,
  };
}
