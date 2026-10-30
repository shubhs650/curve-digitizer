import type { Dataset, Graph, Point } from '@cd/core';
import { type AxisTypes, type Mat3, pixelToValue, pointSigma } from '@cd/math';

/** Raised when a graph cannot be exported yet (e.g. it is not calibrated). */
export class ExportError extends Error {
  override readonly name = 'ExportError';
}

/** One exported row: values recomputed from `px` through the calibration, never read from the cache. */
export interface ExportPoint {
  readonly x: number;
  readonly y: number;
  readonly sigmaX: number;
  readonly sigmaY: number;
  readonly excludedFromFit: boolean;
  readonly outOfRange: boolean;
}

export interface ExportDataset {
  readonly dataset: Dataset;
  readonly points: readonly ExportPoint[];
  /** Function-mode points that shared an X with another and were averaged into one row. */
  readonly merged: number;
}

function axesOf(graph: Graph): { readonly matrix: Mat3; readonly axes: AxisTypes } {
  const calibration = graph.calibration;
  if (!calibration) throw new ExportError(`Graph "${graph.name}" is not calibrated yet`);
  return { matrix: calibration.matrix, axes: { x: calibration.xAxis.type, y: calibration.yAxis.type } };
}

function exportPoint(point: Point, matrix: Mat3, axes: AxisTypes): ExportPoint {
  const [x, y] = pixelToValue(matrix, axes, point.px);
  const [sigmaX, sigmaY] = pointSigma(matrix, axes, point.px, point.lineWidthPx);
  return { x, y, sigmaX, sigmaY, excludedFromFit: point.excludedFromFit, outOfRange: point.outOfRange };
}

/**
 * Function mode (PRD §4.7): sorted by X; points with exactly the same X become one row with the mean Y, the
 * standard error of that mean as σy (`√Σσ²/n`), and a flag set when any merged point had it.
 */
function asFunction(points: readonly ExportPoint[]): { points: ExportPoint[]; merged: number } {
  const sorted = [...points].sort((a, b) => a.x - b.x);
  const out: ExportPoint[] = [];
  let merged = 0;
  for (let i = 0; i < sorted.length;) {
    let j = i + 1;
    while (j < sorted.length && sorted[j]?.x === sorted[i]?.x) j++;
    const group = sorted.slice(i, j);
    const first = group[0];
    if (first && group.length === 1) out.push(first);
    else if (first) {
      merged += group.length;
      const n = group.length;
      const rss = (k: 'sigmaX' | 'sigmaY') => Math.sqrt(group.reduce((s, p) => s + p[k] ** 2, 0)) / n;
      out.push({
        x: first.x,
        y: group.reduce((s, p) => s + p.y, 0) / n,
        sigmaX: rss('sigmaX'),
        sigmaY: rss('sigmaY'),
        excludedFromFit: group.some((p) => p.excludedFromFit),
        outOfRange: group.some((p) => p.outOfRange),
      });
    }
    i = j;
  }
  return { points: out, merged };
}

/** Every dataset of a calibrated graph with its exported rows; path datasets keep pick order. */
export function exportDatasets(graph: Graph): ExportDataset[] {
  const { matrix, axes } = axesOf(graph);
  return graph.datasets.map((dataset) => {
    const points = dataset.points.map((p) => exportPoint(p, matrix, axes));
    if (dataset.mode === 'path') return { dataset, points, merged: 0 };
    return { dataset, ...asFunction(points) };
  });
}

/** `Temperature = 300 °C`, or '' without a family parameter. */
export function paramText(dataset: Dataset): string {
  const p = dataset.param;
  if (!p) return '';
  return `${p.name} = ${String(p.value)}${p.unit === '' ? '' : ` ${p.unit}`}`;
}

/** `Flow rate Q [m³/h]`. */
export function axisText(axis: { readonly label: string; readonly unit?: string }): string {
  return axis.unit === undefined || axis.unit === '' ? axis.label : `${axis.label} [${axis.unit}]`;
}
