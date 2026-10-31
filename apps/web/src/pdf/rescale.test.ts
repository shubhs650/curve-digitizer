import type { Graph, Point } from '@cd/core';
import { describe, expect, it } from 'vitest';
import { EMPTY_DRAFT, evaluateDraft } from '../calibration/draft';
import { pointCache } from '../points/cache';
import { rescaleGraph } from './rescale';

const evaluation = evaluateDraft({
  ...EMPTY_DRAFT,
  picks: [
    [10, 200],
    [310, 200],
    [10, 200],
    [10, 20],
  ],
  values: { x1: '0', x2: '30', y1: '1', y2: '100', xAxisAt: '', yAxisAt: '' },
  xAxis: { type: 'linear', label: 'Q' },
  yAxis: { type: 'log10', label: 'H' },
});
if (evaluation.status !== 'ok') throw new Error('expected a calibration');
const calibration = evaluation.calibration;

const point = (id: string, px: readonly [number, number], lineWidthPx?: number): Point => ({
  id,
  px,
  ...pointCache(calibration, px, lineWidthPx),
  excludedFromFit: id === 'p2',
  outOfRange: false,
  origin: lineWidthPx === undefined ? 'manual' : 'snap',
  ...(lineWidthPx === undefined ? {} : { lineWidthPx }),
});

const graph = {
  calibration,
  datasets: [
    {
      id: 'd1',
      name: 'A',
      color: '#000',
      mode: 'function',
      xUnit: '',
      yUnit: '',
      sourceRef: '',
      notes: '',
      points: [point('p1', [100.5, 120.25], 2.5), point('p2', [250, 60])],
    },
  ],
} as unknown as Graph;

describe('rescaleGraph', () => {
  it('scales every pixel position and stroke width and keeps the calibrated values', () => {
    const { calibration: scaled, datasets } = rescaleGraph(graph, 2);
    expect(scaled?.points.map((p) => p.px)).toEqual([
      [20, 400],
      [620, 400],
      [20, 400],
      [20, 40],
    ]);
    expect(scaled?.points.map((p) => p.axis)).toEqual(calibration.points.map((p) => p.axis));
    expect(scaled?.resolution.xUnitsPerPx).toBeCloseTo(calibration.resolution.xUnitsPerPx / 2, 12);
    expect(scaled?.residualPx).toBeCloseTo(0, 9);

    const [p1, p2] = datasets[0]?.points ?? [];
    expect(p1).toMatchObject({ px: [201, 240.5], lineWidthPx: 5, origin: 'snap' });
    expect(p2).toMatchObject({ px: [500, 120], excludedFromFit: true, origin: 'manual' });
    expect(p2?.lineWidthPx).toBeUndefined();
    const before = graph.datasets[0]?.points ?? [];
    for (const [i, p] of [p1, p2].entries()) {
      expect(p?.value[0]).toBeCloseTo(before[i]?.value[0] ?? NaN, 9);
      expect(p?.value[1]).toBeCloseTo(before[i]?.value[1] ?? NaN, 9);
    }
    // The stroke scales with the render, the ½ px pick resolution does not: sigma shrinks, but by less than k.
    const sigma = before[0]?.sigma[0] ?? NaN;
    expect(p1?.sigma[0]).toBeLessThan(sigma);
    expect(p1?.sigma[0]).toBeGreaterThan(sigma / 2);
  });

  it('leaves an uncalibrated graph uncalibrated with zero caches', () => {
    const { calibration: scaled, datasets } = rescaleGraph({ ...graph, calibration: null }, 1.5);
    expect(scaled).toBeNull();
    expect(datasets[0]?.points[1]).toMatchObject({ px: [375, 90], value: [0, 0], sigma: [0, 0] });
  });
});
