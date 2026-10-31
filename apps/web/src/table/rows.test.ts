import type { Dataset, Graph, Point } from '@cd/core';
import { describe, expect, it } from 'vitest';
import { EMPTY_DRAFT, evaluateDraft } from '../calibration/draft';
import { pointCache } from '../points/cache';
import { cellText, columns, editPoint, editText, tableTsv } from './rows';

const evaluation = evaluateDraft({
  ...EMPTY_DRAFT,
  picks: [
    [0, 100],
    [200, 100],
    [0, 100],
    [0, 0],
  ],
  values: { x1: '0', x2: '20', y1: '1', y2: '100', xAxisAt: '', yAxisAt: '' },
  xAxis: { type: 'linear', label: 'Flow', unit: 'm³/h' },
  yAxis: { type: 'log10', label: 'Head' },
});
if (evaluation.status !== 'ok') throw new Error('expected a calibration');
const calibration = evaluation.calibration;

const point = (id: string, px: readonly [number, number], extra: Partial<Point> = {}): Point => ({
  id,
  px,
  ...pointCache(calibration, px, extra.lineWidthPx),
  excludedFromFit: false,
  outOfRange: false,
  origin: 'manual',
  ...extra,
});

const DATASET: Dataset = {
  id: 'd1',
  name: 'Pump',
  color: '#000000',
  mode: 'function',
  xUnit: '',
  yUnit: 'm',
  sourceRef: '',
  notes: '',
  points: [
    point('p1', [50, 50]),
    point('p2', [150.125, 25], { origin: 'snap', lineWidthPx: 2, excludedFromFit: true }),
  ],
};
const graph = { calibration, datasets: [DATASET] } as unknown as Graph;

describe('data table rows', () => {
  it('heads value columns with axis labels and units, the dataset unit winning', () => {
    expect(columns(graph, DATASET).map((c) => c.header)).toEqual([
      '#',
      'Flow (m³/h)',
      'Head (m)',
      'σx',
      'σy',
      'x px',
      'y px',
      'Origin',
      'Excluded',
      'Residual',
    ]);
    expect(
      columns({ ...graph, calibration: null }, DATASET)
        .filter((c) => c.editable)
        .map((c) => c.id),
    ).toEqual(['pxX', 'pxY']);
  });

  it('shows values at the calibration resolution and pixels to 0.01 px', () => {
    const p2 = DATASET.points[1] as Point;
    // 0.1 units/px on X → two decimals; log Y → four significant digits.
    expect(cellText(graph, p2, 1, 'x')).toBe('15.01');
    expect(cellText(graph, p2, 1, 'y')).toBe('31.62');
    expect(cellText(graph, p2, 1, 'pxX')).toBe('150.13');
    expect(cellText(graph, p2, 1, 'index')).toBe('2');
    expect(cellText(graph, p2, 1, 'origin')).toBe('snapped');
    expect(cellText(graph, p2, 1, 'residual')).toBe('—');
    expect(cellText({ ...graph, calibration: null }, p2, 1, 'x')).toBe('—');
    expect(editText(p2, 'x')).toBe('15.0125');
  });

  it('moves a point to a typed value or pixel and makes it manual', () => {
    const p2 = DATASET.points[1] as Point;
    const typed = editPoint(graph, p2, 'y', '10');
    if (!typed.ok) throw new Error(typed.error);
    expect(typed.point.px[0]).toBeCloseTo(150.125, 9);
    expect(typed.point.px[1]).toBeCloseTo(50, 9);
    expect(typed.point.value[1]).toBeCloseTo(10, 9);
    expect(typed.point).toMatchObject({ id: 'p2', origin: 'manual', excludedFromFit: true });
    expect(typed.point.lineWidthPx).toBeUndefined();

    const moved = editPoint(graph, p2, 'pxX', ' 100 ');
    expect(moved.ok && moved.point.px).toEqual([100, 25]);
    expect(moved.ok && moved.point.value[0]).toBeCloseTo(10, 9);
  });

  it('rejects text that is not a number, a log value at or below 0, and values before calibration', () => {
    const p1 = DATASET.points[0] as Point;
    expect(editPoint(graph, p1, 'x', 'abc')).toEqual({ ok: false, error: 'Enter a number' });
    expect(editPoint(graph, p1, 'y', '0')).toEqual({ ok: false, error: 'A log axis needs a value above 0' });
    expect(editPoint({ ...graph, calibration: null }, p1, 'x', '3')).toEqual({
      ok: false,
      error: 'Calibrate the graph first',
    });
  });

  it('copies full precision as tab-separated rows', () => {
    const tsv = tableTsv(graph, DATASET);
    const lines = tsv.split('\r\n');
    expect(lines[0]).toBe('Flow (m³/h)\tHead (m)\tσx\tσy\tx px\ty px\tOrigin\tExcluded');
    expect(lines[2]?.split('\t')).toEqual([
      '15.0125',
      expect.stringMatching(/^31\.62277660/) as string,
      expect.any(String) as string,
      expect.any(String) as string,
      '150.125',
      '25',
      'snapped',
      'TRUE',
    ]);
    expect(lines).toHaveLength(4);
    expect(
      tableTsv({ ...graph, calibration: null }, DATASET, [DATASET.points[0] as Point]).split('\r\n')[1],
    ).toBe('\t\t\t\t50\t50\tmanual\tFALSE');
  });
});
