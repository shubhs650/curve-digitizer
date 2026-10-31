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

/** An exported row and its pick-resolution floor: σ of a 0.5 px pick on no stroke, in data units. */
interface Row {
  readonly point: ExportPoint;
  readonly floorX: number;
  readonly floorY: number;
}

function exportRow(point: Point, matrix: Mat3, axes: AxisTypes): Row {
  const [x, y] = pixelToValue(matrix, axes, point.px);
  const [sigmaX, sigmaY] = pointSigma(matrix, axes, point.px, point.lineWidthPx);
  const [floorX, floorY] = pointSigma(matrix, axes, point.px, 0);
  return {
    point: { x, y, sigmaX, sigmaY, excludedFromFit: point.excludedFromFit, outOfRange: point.outOfRange },
    floorX,
    floorY,
  };
}

/**
 * Function mode (PRD §4.7): sorted by X; points with exactly the same X become one row with the mean Y, the
 * standard error of that mean as σ (`√Σσ²/n`) but never below the pick resolution of one point (A9: no row is
 * located better than 0.5 px), and a flag set when any merged point had it.
 */
function asFunction(rows: readonly Row[]): { points: ExportPoint[]; merged: number } {
  const sorted = [...rows].sort((a, b) => a.point.x - b.point.x);
  const out: ExportPoint[] = [];
  let merged = 0;
  for (let i = 0; i < sorted.length;) {
    let j = i + 1;
    while (j < sorted.length && sorted[j]?.point.x === sorted[i]?.point.x) j++;
    const group = sorted.slice(i, j);
    const first = group[0];
    if (first && group.length === 1) out.push(first.point);
    else if (first) {
      merged += group.length;
      const n = group.length;
      const sigma = (k: 'sigmaX' | 'sigmaY', floor: 'floorX' | 'floorY') =>
        Math.max(
          Math.sqrt(group.reduce((s, r) => s + r.point[k] ** 2, 0)) / n,
          Math.min(...group.map((r) => r[floor])),
        );
      out.push({
        x: first.point.x,
        y: group.reduce((s, r) => s + r.point.y, 0) / n,
        sigmaX: sigma('sigmaX', 'floorX'),
        sigmaY: sigma('sigmaY', 'floorY'),
        excludedFromFit: group.some((r) => r.point.excludedFromFit),
        outOfRange: group.some((r) => r.point.outOfRange),
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
    const rows = dataset.points.map((p) => exportRow(p, matrix, axes));
    if (dataset.mode === 'path') return { dataset, points: rows.map((r) => r.point), merged: 0 };
    return { dataset, ...asFunction(rows) };
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
