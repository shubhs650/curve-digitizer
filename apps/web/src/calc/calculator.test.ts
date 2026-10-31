import type { Calibration, Dataset, Fit, Graph, Point } from '@cd/core';
import { describe, expect, it } from 'vitest';
import { calcTsv, calculate, compare, datasetValueAt, MAX_XS, parseXs, pointTable } from './calculator';

// x = px / 10, y = (100 − py) / 10 on linear axes.
const linear: Calibration = {
  xAxis: { type: 'linear', label: 'Q', unit: 'm³/h' },
  yAxis: { type: 'linear', label: 'H' },
  model: 'affine',
  points: [],
  matrix: [0.1, 0, 0, 0, -0.1, 10, 0, 0, 1],
  residualPx: 0,
  resolution: { xUnitsPerPx: 0.1, yUnitsPerPx: 0.1 },
  warnings: [],
};

const point = (id: string, x: number, y: number, excludedFromFit = false): Point => ({
  id,
  px: [x * 10, 100 - y * 10],
  value: [x, y],
  sigma: [0.05, 0.05],
  excludedFromFit,
  outOfRange: false,
  origin: 'manual',
});

const dataset = (id: string, points: readonly Point[], mode: Dataset['mode'] = 'function'): Dataset => ({
  id,
  name: id.toUpperCase(),
  color: '#0072b2',
  mode,
  xUnit: '',
  yUnit: 'm',
  sourceRef: '',
  notes: '',
  points,
});

const graph = (
  datasets: readonly Dataset[],
  fits: readonly Fit[] = [],
  calibration: Calibration | null = linear,
): Graph => ({
  id: 'g1',
  name: 'g',
  source: { kind: 'image' },
  image: { path: 'graphs/g1/original.png', width: 100, height: 100 },
  processing: [],
  calibration,
  datasets,
  fits,
  view: { zoom: 1, pan: [0, 0] },
});

const a = dataset('a', [point('a3', 3, 6), point('a1', 1, 2), point('a2', 2, 4), point('ax', 2.5, 9, true)]);
const b = dataset('b', [point('b1', 1, 1), point('b2', 2, 1), point('b2b', 2, 3), point('b3', 3, 0)]);

describe('parseXs', () => {
  it('reads numbers separated by commas, semicolons, spaces and new lines', () => {
    expect(parseXs('1, 2.5;3\n4e1  -5')).toEqual({ xs: [1, 2.5, 3, 40, -5] });
    expect(parseXs('  ')).toEqual({ xs: [] });
  });

  it('names what is not a number, and caps the count', () => {
    expect(parseXs('1, two')).toEqual({ error: '"two" is not a number.' });
    expect(parseXs(Array.from({ length: MAX_XS + 1 }, () => '1').join(' '))).toHaveProperty('error');
  });
});

describe('datasetValueAt', () => {
  it('reads between included points, never beyond them', () => {
    const g = graph([a]);
    const table = pointTable(g, a);
    expect(datasetValueAt(g, a, 1.5, table)).toEqual({ y: 3, source: 'points', extrapolated: false });
    // The excluded point at x 2.5 is ignored.
    expect(datasetValueAt(g, a, 2.5, table)?.y).toBeCloseTo(5);
    expect(datasetValueAt(g, a, 3, table)?.y).toBeCloseTo(6);
    expect(datasetValueAt(g, a, 0.5, table)).toBeNull();
    expect(datasetValueAt(g, a, 3.5, table)).toBeNull();
  });

  it('averages points at one X', () => {
    const g = graph([b]);
    expect(datasetValueAt(g, b, 2, pointTable(g, b))?.y).toBeCloseTo(2);
  });

  it('answers from the fit when there is one, flagging extrapolation', () => {
    const fit: Fit = {
      id: 'f',
      datasetId: 'a',
      model: 'poly',
      space: { x: 'lin', y: 'lin' },
      params: { c: [0, 2] },
      domain: [1, 3],
      stats: { n: 3, r2: 1, rmse: 0, aicc: 0 },
      recommended: true,
    };
    const g = graph([a], [fit]);
    expect(datasetValueAt(g, a, 2, null)).toEqual({ y: 4, source: 'fit', extrapolated: false });
    expect(datasetValueAt(g, a, 5, null)).toEqual({ y: 10, source: 'fit', extrapolated: true });
  });

  it('interpolates on the log paper of a log axis', () => {
    // A log x axis from px 0 (x = 1) to px 100 (x = 100); points at x 1 and 100 with y 0 and 10.
    const logX: Calibration = {
      ...linear,
      xAxis: { type: 'log10', label: 'f' },
      matrix: [0.02, 0, 0, 0, -0.1, 10, 0, 0, 1],
    };
    const d = dataset('l', [
      { ...point('l1', 0, 0), px: [0, 100] },
      { ...point('l2', 0, 10), px: [100, 0] },
    ]);
    const g = graph([d], [], logX);
    expect(datasetValueAt(g, d, 10, pointTable(g, d))?.y).toBeCloseTo(5);
  });

  it('has nothing for path datasets or without a calibration', () => {
    const path = dataset('p', a.points, 'path');
    expect(pointTable(graph([path]), path)).toBeNull();
    expect(pointTable(graph([a], [], null), a)).toBeNull();
    expect(calculate(graph([a, path]), [1]).map((c) => c.dataset.id)).toEqual(['a']);
  });
});

describe('compare and copy', () => {
  it('gives A − B and A / B, leaving out what cannot be computed', () => {
    const v = (y: number) => ({ y, source: 'points', extrapolated: false }) as const;
    expect(compare(v(6), v(2))).toEqual({ difference: 4, ratio: 3 });
    expect(compare(v(6), v(0))).toEqual({ difference: 6, ratio: null });
    expect(compare(null, v(1))).toEqual({ difference: null, ratio: null });
  });

  it('copies X, every dataset and the comparison as tab-separated text, full precision', () => {
    const g = graph([a, b]);
    const xs = [1.5, 2, 4];
    const columns = calculate(g, xs);
    expect(calcTsv(g, xs, columns, { a: 0, b: 1 }).split('\r\n')).toEqual([
      'X (m³/h)\tA (m)\tB (m)\tA − B\tA / B',
      '1.5\t3\t1.5\t1.5\t2',
      '2\t4\t2\t2\t2',
      '4\t\t\t\t',
      '',
    ]);
    expect(calcTsv(g, [2], columns.slice(0, 1), null).split('\r\n')[0]).toBe('X (m³/h)\tA (m)');
  });
});
