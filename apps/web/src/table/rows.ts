import type { Dataset, Fit, Graph, Point, Vec2 } from '@cd/core';
import { valueToPixel } from '@cd/math';
import { formatValue } from '../calibration/format';
import { placePoint } from '../points/cache';
import { pointValue, residual } from '../fit/fitInputs';

// The data table's model (task 1.6, PRD §4.11): one row per point of a dataset, in pick order. Values are shown
// at the precision the calibration resolves; copies carry full precision.

export type EditableColumn = 'x' | 'y' | 'pxX' | 'pxY';

export interface Column {
  readonly id: EditableColumn | 'index' | 'sigmaX' | 'sigmaY' | 'origin' | 'excluded' | 'residual';
  readonly header: string;
  readonly editable: boolean;
}

/** The table's columns for a graph; the value headers carry the axis labels and units. */
export function columns(graph: Graph, dataset: Dataset): readonly Column[] {
  const axis = (which: 'x' | 'y') => {
    const a = which === 'x' ? graph.calibration?.xAxis : graph.calibration?.yAxis;
    const unit = (which === 'x' ? dataset.xUnit : dataset.yUnit) || a?.unit || '';
    const label = a?.label ?? which.toUpperCase();
    return unit === '' ? label : `${label} (${unit})`;
  };
  const calibrated = graph.calibration !== null;
  return [
    { id: 'index', header: '#', editable: false },
    { id: 'x', header: axis('x'), editable: calibrated },
    { id: 'y', header: axis('y'), editable: calibrated },
    { id: 'sigmaX', header: 'σx', editable: false },
    { id: 'sigmaY', header: 'σy', editable: false },
    { id: 'pxX', header: 'x px', editable: true },
    { id: 'pxY', header: 'y px', editable: true },
    { id: 'origin', header: 'Origin', editable: false },
    { id: 'excluded', header: 'Excluded', editable: false },
    { id: 'residual', header: 'Residual', editable: false },
  ];
}

const ORIGINS: Readonly<Record<Point['origin'], string>> = {
  manual: 'manual',
  snap: 'snapped',
  trace: 'traced',
  xstep: 'X-step',
};

/** A cell as shown: values at the calibration's resolution, pixels to 0.01 px. */
export function cellText(
  graph: Graph,
  point: Point,
  index: number,
  column: Column['id'],
  fit: Fit | null = null,
): string {
  const c = graph.calibration;
  const shown = (v: number, which: 'x' | 'y') =>
    c === null
      ? '—'
      : which === 'x'
        ? formatValue(v, c.xAxis.type, c.resolution.xUnitsPerPx)
        : formatValue(v, c.yAxis.type, c.resolution.yUnitsPerPx);
  switch (column) {
    case 'index':
      return String(index + 1);
    case 'x':
      return shown(point.value[0], 'x');
    case 'y':
      return shown(point.value[1], 'y');
    // σ is a spread, shown in the same linear units as a linear axis would show it.
    case 'sigmaX':
      return c === null ? '—' : formatValue(point.sigma[0], 'linear', c.resolution.xUnitsPerPx);
    case 'sigmaY':
      return c === null ? '—' : formatValue(point.sigma[1], 'linear', c.resolution.yUnitsPerPx);
    case 'pxX':
      return point.px[0].toFixed(2);
    case 'pxY':
      return point.px[1].toFixed(2);
    case 'origin':
      return ORIGINS[point.origin];
    case 'excluded':
      return point.excludedFromFit ? 'yes' : '';
    case 'residual': {
      const v = fit === null ? null : pointValue(graph, point);
      if (fit === null || v === null) return '—';
      const r = residual(fit, v);
      return Number.isFinite(r) ? String(Number(r.toPrecision(3))) : '—';
    }
  }
}

/** The text an editor starts from: the full-precision number, not the rounded display. */
export function editText(point: Point, column: EditableColumn): string {
  const value = { x: point.value[0], y: point.value[1], pxX: point.px[0], pxY: point.px[1] }[column];
  return String(Number(value.toPrecision(12)));
}

export type EditResult =
  { readonly ok: true; readonly point: Point } | { readonly ok: false; readonly error: string };

/**
 * The point with one cell changed. A typed value moves the point to where that value is on the image, so `px`
 * stays the source of truth; an edited point becomes `manual`, like a dragged one.
 */
export function editPoint(graph: Graph, point: Point, column: EditableColumn, text: string): EditResult {
  const value = Number(text.trim());
  if (text.trim() === '' || !Number.isFinite(value)) return { ok: false, error: 'Enter a number' };
  let px: Vec2;
  if (column === 'pxX' || column === 'pxY') {
    px = column === 'pxX' ? [value, point.px[1]] : [point.px[0], value];
  } else {
    const c = graph.calibration;
    if (c === null) return { ok: false, error: 'Calibrate the graph first' };
    const type = column === 'x' ? c.xAxis.type : c.yAxis.type;
    if (type === 'log10' && !(value > 0)) return { ok: false, error: 'A log axis needs a value above 0' };
    const values: Vec2 = column === 'x' ? [value, point.value[1]] : [point.value[0], value];
    px = valueToPixel(c.matrix, { x: c.xAxis.type, y: c.yAxis.type }, values);
  }
  return { ok: true, point: placePoint(graph, { px, origin: 'manual' }, point) };
}

const COPY_COLUMNS = ['x', 'y', 'sigmaX', 'sigmaY', 'pxX', 'pxY', 'origin', 'excluded'] as const;

/** Tab-separated rows for the clipboard, full precision, with a header row; pastes into Excel as columns. */
export function tableTsv(graph: Graph, dataset: Dataset, points: readonly Point[] = dataset.points): string {
  const header = columns(graph, dataset).filter((c) => (COPY_COLUMNS as readonly string[]).includes(c.id));
  const full = (v: number) => String(Number(v.toPrecision(12)));
  const calibrated = graph.calibration !== null;
  const cell = (p: Point, id: (typeof COPY_COLUMNS)[number]): string => {
    switch (id) {
      case 'x':
        return calibrated ? full(p.value[0]) : '';
      case 'y':
        return calibrated ? full(p.value[1]) : '';
      case 'sigmaX':
        return calibrated ? full(p.sigma[0]) : '';
      case 'sigmaY':
        return calibrated ? full(p.sigma[1]) : '';
      case 'pxX':
        return full(p.px[0]);
      case 'pxY':
        return full(p.px[1]);
      case 'origin':
        return ORIGINS[p.origin];
      case 'excluded':
        return p.excludedFromFit ? 'TRUE' : 'FALSE';
    }
  };
  const lines = [
    header.map((c) => c.header).join('\t'),
    ...points.map((p) => COPY_COLUMNS.map((id) => cell(p, id)).join('\t')),
  ];
  return `${lines.join('\r\n')}\r\n`;
}
