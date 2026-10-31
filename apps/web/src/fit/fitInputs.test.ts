import type { Calibration, Dataset, Graph, Point } from '@cd/core';
import { fitModel } from '@cd/fit';
import { describe, expect, it } from 'vitest';
import { fitBlock, fitInputs, fitPathPx, isStale, pointValue, residual, toStoredFit } from './fitInputs';

// x = px / 10, y = (100 − py) / 10 on linear axes.
const calibration: Calibration = {
  xAxis: { type: 'linear', label: 'X' },
  yAxis: { type: 'linear', label: 'Y' },
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

const dataset = (points: readonly Point[], mode: Dataset['mode'] = 'function'): Dataset => ({
  id: 'd1',
  name: 'Curve',
  color: '#0072b2',
  mode,
  xUnit: '',
  yUnit: '',
  sourceRef: '',
  notes: '',
  points,
});

const graph = (d: Dataset, cal: Calibration | null = calibration): Graph => ({
  id: 'g1',
  name: 'g',
  source: { kind: 'image' },
  image: { path: 'graphs/g1/original.png', width: 100, height: 100 },
  processing: [],
  calibration: cal,
  datasets: [d],
  fits: [],
  view: { zoom: 1, pan: [0, 0] },
});

const line = [
  point('a', 1, 2),
  point('b', 2, 4),
  point('c', 3, 6),
  point('d', 4, 8.2, true),
  point('e', 5, 10),
];

describe('fitBlock', () => {
  it('explains why a dataset cannot be fitted', () => {
    expect(fitBlock(graph(dataset(line)), null)).toMatch(/Add a dataset/);
    expect(fitBlock(graph(dataset(line), null), dataset(line))).toMatch(/Calibrate the graph first/);
    expect(fitBlock(graph(dataset(line)), dataset(line, 'path'))).toMatch(/path dataset/);
    expect(fitBlock(graph(dataset(line)), dataset(line.slice(2)))).toMatch(/at least 3 points .* has 2/);
    expect(fitBlock(graph(dataset(line)), dataset(line))).toBeNull();
  });
});

describe('fitInputs', () => {
  it('recomputes values from px and leaves excluded points out', () => {
    const inputs = fitInputs(graph(dataset(line)), dataset(line));
    expect(inputs.x).toEqual([1, 2, 3, 5].map((v) => expect.closeTo(v, 12) as number));
    expect(inputs.y).toEqual([2, 4, 6, 10].map((v) => expect.closeTo(v, 12) as number));
    expect(inputs.excluded).toHaveLength(1);
    expect(inputs.space).toEqual({ x: 'lin', y: 'lin' });
    expect(pointValue(graph(dataset(line), null), point('z', 1, 1))).toBeNull();
  });

  it('fits on log axes when the calibration has them', () => {
    const log: Calibration = { ...calibration, yAxis: { type: 'log10', label: 'Y' } };
    expect(fitInputs(graph(dataset(line), log), dataset(line)).space).toEqual({ x: 'lin', y: 'log' });
  });
});

describe('stored fits', () => {
  const g = graph(dataset(line));
  const inputs = fitInputs(g, dataset(line));
  const result = fitModel(inputs.x, inputs.y, inputs.space, { model: 'poly', degree: 1 });
  if (result === null) throw new Error('expected a fit');
  const fit = toStoredFit(result, 'd1', 'f1', true);

  it('keeps what the project stores', () => {
    expect(fit).toMatchObject({ id: 'f1', datasetId: 'd1', model: 'poly', recommended: true });
    expect(Object.keys(fit).sort()).toEqual(
      ['datasetId', 'domain', 'id', 'model', 'params', 'recommended', 'space', 'stats'].sort(),
    );
  });

  it('is stale once the included points change in number or range', () => {
    expect(isStale(fit, inputs)).toBe(false);
    expect(isStale(fit, { ...inputs, x: inputs.x.slice(1), y: inputs.y.slice(1) })).toBe(true);
    expect(isStale(fit, { ...inputs, x: [...inputs.x.slice(0, 3), 6] })).toBe(true);
    expect(isStale(fit, { ...inputs, space: { x: 'log', y: 'lin' } })).toBe(true);
  });

  it('gives residuals in fit space and a curve in image px over the domain', () => {
    expect(residual(fit, [3, 6])).toBeCloseTo(0, 9);
    expect(residual(fit, [4, 8.2])).toBeCloseTo(0.2, 9);
    // On a log y axis the same coefficients mean log10 y = 2x, so the residual is log10(60) − 6.
    expect(residual({ ...fit, space: { x: 'lin', y: 'log' } }, [3, 60])).toBeCloseTo(Math.log10(60) - 6, 9);
    const path = fitPathPx(g, fit);
    expect(path.length).toBeGreaterThan(100);
    expect(path[0]?.[0]).toBeCloseTo(10, 9);
    expect(path[0]?.[1]).toBeCloseTo(80, 9);
    expect(path.at(-1)?.[0]).toBeCloseTo(50, 9);
    expect(fitPathPx(graph(dataset(line), null), fit)).toEqual([]);
  });
});
