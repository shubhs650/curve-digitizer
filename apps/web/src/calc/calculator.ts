import type { Dataset, Graph } from '@cd/core';
import { evaluateFit, fromSpace, toSpace } from '@cd/fit';
import { linearSpline } from '@cd/math';
import { fitInputs, fitSpaces } from '../fit/fitInputs';

/** Most X values the calculator takes at once. */
export const MAX_XS = 200;

/** Y of one dataset at one X: from its fit when it has one, else read between its points. */
export interface CalcValue {
  readonly y: number;
  readonly source: 'fit' | 'points';
  /** X is outside the fit's domain (a fit extrapolates; points are never extrapolated, see `datasetValueAt`). */
  readonly extrapolated: boolean;
}

/**
 * The X values typed into the calculator: numbers separated by commas, semicolons, spaces or new lines.
 * An error naming the first part that is not a number, or when there are more than {@link MAX_XS}.
 */
export function parseXs(text: string): { readonly xs: readonly number[] } | { readonly error: string } {
  const parts = text.split(/[\s,;]+/).filter((p) => p !== '');
  if (parts.length > MAX_XS) return { error: `Up to ${String(MAX_XS)} X values at a time.` };
  const xs: number[] = [];
  for (const part of parts) {
    const x = Number(part);
    if (!Number.isFinite(x)) return { error: `"${part}" is not a number.` };
    xs.push(x);
  }
  return { xs };
}

/** The dataset's included points as a linear table in fit space, sorted, points at one X averaged. */
export interface PointTable {
  readonly u: readonly number[];
  readonly v: readonly number[];
}

export function pointTable(graph: Graph, dataset: Dataset): PointTable | null {
  if (dataset.mode !== 'function' || graph.calibration === null) return null;
  const { x, y, space } = fitInputs(graph, dataset);
  const pairs = x
    .map((xi, i) => [toSpace(xi, space.x), toSpace(y[i] ?? Number.NaN, space.y)] as const)
    .filter(([u, v]) => Number.isFinite(u) && Number.isFinite(v))
    .sort((a, b) => a[0] - b[0]);
  const u: number[] = [];
  const v: number[] = [];
  let count = 0;
  for (const [ui, vi] of pairs) {
    if (u.length > 0 && ui === u[u.length - 1]) {
      count++;
      v[v.length - 1] = (v[v.length - 1] ?? 0) + (vi - (v[v.length - 1] ?? 0)) / count;
    } else {
      u.push(ui);
      v.push(vi);
      count = 1;
    }
  }
  return u.length > 0 ? { u, v } : null;
}

/**
 * Y of the dataset at x. A fitted dataset answers from its fit, flagged when x is outside the fit's range.
 * Otherwise the points are joined by straight lines on the chart's paper (log10 on a log axis) and read between;
 * outside the points there is no answer, since guessing a trend is what a fit is for. Null when there is none.
 */
export function datasetValueAt(
  graph: Graph,
  dataset: Dataset,
  x: number,
  table: PointTable | null,
): CalcValue | null {
  const fit = graph.fits.find((f) => f.datasetId === dataset.id);
  if (fit) {
    const { y, extrapolated } = evaluateFit(fit, x);
    return Number.isFinite(y) ? { y, source: 'fit', extrapolated } : null;
  }
  if (table === null) return null;
  const space = fitSpaces(graph);
  const u = toSpace(x, space.x);
  const lo = table.u[0] ?? Number.NaN;
  const hi = table.u[table.u.length - 1] ?? Number.NaN;
  if (!(u >= lo && u <= hi)) return null;
  const v = table.u.length === 1 ? (table.v[0] ?? Number.NaN) : linearSpline(table.u, table.v, u);
  return { y: fromSpace(v, space.y), source: 'points', extrapolated: false };
}

/** A − B and A / B at one X (null where either is missing; the ratio also where B is 0). */
export function compare(
  a: CalcValue | null,
  b: CalcValue | null,
): { readonly difference: number | null; readonly ratio: number | null } {
  if (a === null || b === null) return { difference: null, ratio: null };
  return { difference: a.y - b.y, ratio: b.y === 0 ? null : a.y / b.y };
}

export interface CalcColumn {
  readonly dataset: Dataset;
  readonly values: readonly (CalcValue | null)[];
}

/** Every function dataset of the graph at every x. */
export function calculate(graph: Graph, xs: readonly number[]): CalcColumn[] {
  return graph.datasets
    .filter((d) => d.mode === 'function')
    .map((dataset) => {
      const table = pointTable(graph, dataset);
      return { dataset, values: xs.map((x) => datasetValueAt(graph, dataset, x, table)) };
    });
}

function unitSuffix(unit: string): string {
  return unit ? ` (${unit})` : '';
}

/**
 * The calculator as tab-separated text for the clipboard, full precision: X, then each dataset's Y, then A − B
 * and A / B when comparing. Missing values are empty cells.
 */
export function calcTsv(
  graph: Graph,
  xs: readonly number[],
  columns: readonly CalcColumn[],
  comparison: { readonly a: number; readonly b: number } | null,
): string {
  const xUnit = graph.calibration?.xAxis.unit ?? '';
  const cell = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v));
  const a = comparison ? columns[comparison.a] : undefined;
  const b = comparison ? columns[comparison.b] : undefined;
  const header = [
    `X${unitSuffix(xUnit)}`,
    ...columns.map((c) => `${c.dataset.name}${unitSuffix(c.dataset.yUnit)}`),
  ];
  if (a && b) header.push(`${a.dataset.name} − ${b.dataset.name}`, `${a.dataset.name} / ${b.dataset.name}`);
  const rows = xs.map((x, i) => {
    const row = [String(x), ...columns.map((c) => cell(c.values[i]?.y))];
    if (a && b) {
      const { difference, ratio } = compare(a.values[i] ?? null, b.values[i] ?? null);
      row.push(cell(difference), cell(ratio));
    }
    return row.join('\t');
  });
  return [header.join('\t'), ...rows, ''].join('\r\n');
}
