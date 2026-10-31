import type { Graph, Point } from '@cd/core';
import { pixelToValue, pointSigma } from '@cd/math';
import { describe, expect, it } from 'vitest';
import { csvLong } from './csv.ts';
import { EXPORT_INFO, EXPORT_PROJECT } from './test/fixture.ts';
import { exportDatasets } from './values.ts';

// A9 (docs/ACCEPTANCE_TARGETS.md): the uncertainty column is present, positive, and at least the 0.5 px pick
// resolution, carried through the calibration, for every exported point of every origin, on linear and log axes,
// including rows averaged from points sharing an X.

const [linear, logX] = EXPORT_PROJECT.graphs;
if (!linear?.calibration || !logX?.calibration) throw new Error('fixture has two calibrated graphs');

const point = (id: string, px: [number, number], extra: Partial<Point>): Point => ({
  id,
  px,
  value: [0, 0],
  sigma: [0, 0],
  excludedFromFit: false,
  outOfRange: false,
  origin: 'manual',
  ...extra,
});

/** Points as every tool places them: no measured width (manual), snapped, traced, X-step, and a zero width. */
const ORIGINS: readonly Point[] = [
  point('m', [500, 600], {}),
  point('s', [700, 620], { origin: 'snap', lineWidthPx: 2.7 }),
  point('t', [900, 640], { origin: 'trace', lineWidthPx: 3.1 }),
  point('x', [1100, 660], { origin: 'xstep', lineWidthPx: 2.4 }),
  point('z', [1300, 680], { origin: 'trace', lineWidthPx: 0 }),
  // Four zero-width points at one X: their mean is averaged into one row (σ/√n, floored).
  ...[0, 1, 2, 3].map((i) => point(`d${String(i)}`, [1500, 700 + i], { origin: 'trace', lineWidthPx: 0 })),
];

const withPoints = (graph: Graph): Graph => ({
  ...graph,
  datasets: [
    {
      id: 'all',
      name: 'All origins',
      color: '#0072b2',
      mode: 'function',
      xUnit: '',
      yUnit: '',
      sourceRef: '',
      notes: '',
      points: ORIGINS,
    },
  ],
});

describe('A9 uncertainty column', () => {
  for (const graph of [withPoints(linear), withPoints(logX)]) {
    const calibration = graph.calibration;
    if (!calibration) throw new Error('calibrated');
    const axes = { x: calibration.xAxis.type, y: calibration.yAxis.type };

    it(`is positive and ≥ 0.5 px-equivalent for every point (${graph.name})`, () => {
      const [dataset] = exportDatasets(graph);
      expect(dataset?.points).toHaveLength(6);
      for (const row of dataset?.points ?? []) {
        // The 0.5 px floor of the source points behind this row (one, or the averaged group).
        const sources = ORIGINS.filter((p) => pixelToValue(calibration.matrix, axes, p.px)[0] === row.x);
        expect(sources.length).toBeGreaterThan(0);
        const floors = sources.map((p) => pointSigma(calibration.matrix, axes, p.px, 0));
        expect(row.sigmaX).toBeGreaterThan(0);
        expect(row.sigmaY).toBeGreaterThan(0);
        expect(row.sigmaX).toBeGreaterThanOrEqual(Math.min(...floors.map((f) => f[0])) * (1 - 1e-12));
        expect(row.sigmaY).toBeGreaterThanOrEqual(Math.min(...floors.map((f) => f[1])) * (1 - 1e-12));
      }
    });

    it(`is a column of the long CSV with a positive number on every row (${graph.name})`, () => {
      const lines = csvLong(EXPORT_PROJECT, graph, EXPORT_INFO)
        .trim()
        .split('\r\n')
        .filter((l) => !l.startsWith('#') && !l.startsWith('﻿'));
      const header = lines[0]?.split(',') ?? [];
      const sx = header.indexOf('sigma_x');
      const sy = header.indexOf('sigma_y');
      expect(sx).toBeGreaterThan(-1);
      expect(sy).toBeGreaterThan(-1);
      const rows = lines.slice(1).map((l) => l.split(','));
      expect(rows).toHaveLength(6);
      for (const row of rows) {
        expect(Number(row[sx])).toBeGreaterThan(0);
        expect(Number(row[sy])).toBeGreaterThan(0);
      }
    });
  }

  it('keeps the floor when many zero-width points share an X', () => {
    const graph = withPoints(linear);
    const [dataset] = exportDatasets(graph);
    const merged = dataset?.points.at(-1);
    // 0.5 px × 0.05 units/px: four points' σ/√4 alone would be 0.0125.
    expect(merged?.sigmaY).toBeCloseTo(0.5 * 0.05, 12);
  });
});
