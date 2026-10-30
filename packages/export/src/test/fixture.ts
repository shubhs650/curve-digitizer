// The project behind the export golden files: one linear and one log-x graph with awkward names, flags,
// a duplicate X, a path dataset and an uncalibrated graph. Not exported from the package.
import { type Calibration, type Graph, type Point, type Project } from '@cd/core';
import { type AxisTypes, type Correspondence, residuals, solveAffine } from '@cd/math';

function calibration(
  points: readonly Correspondence[],
  axes: AxisTypes,
  units: [string, string],
): Calibration {
  const matrix = solveAffine(points);
  return {
    xAxis: { type: axes.x, label: 'Flow rate Q', unit: units[0] },
    yAxis: { type: axes.y, label: 'Head H', unit: units[1] },
    model: 'affine',
    points,
    matrix,
    residualPx: residuals(matrix, points).rmsPx,
    resolution: { xUnitsPerPx: 0.05, yUnitsPerPx: 0.05 },
    warnings: [],
  };
}

const point = (id: string, px: [number, number], flags: Partial<Point> = {}): Point => ({
  id,
  px,
  value: [0, 0],
  sigma: [0, 0],
  excludedFromFit: false,
  outOfRange: false,
  origin: 'manual',
  ...flags,
});

/** 20 px per unit on both axes, origin at px (200, 1450). */
const LINEAR: readonly Correspondence[] = [
  { px: [400, 1450], axis: [10, 0] },
  { px: [1800, 1450], axis: [80, 0] },
  { px: [200, 1250], axis: [0, 10] },
  { px: [200, 250], axis: [0, 60] },
];

/** x is log10 with one decade per 400 px from 10 at px 200; y linear 10 px per unit from px 1000. */
const LOG_X: readonly Correspondence[] = [
  { px: [200, 1000], axis: [1, 0] },
  { px: [1800, 1000], axis: [5, 0] },
  { px: [200, 900], axis: [1, 10] },
  { px: [200, 100], axis: [1, 90] },
];

const graph = (id: string, name: string, extra: Partial<Graph>): Graph => ({
  id,
  name,
  source: { kind: 'image', fileName: `${id}.png` },
  image: { path: `graphs/${id}/original.png`, width: 2000, height: 1500 },
  processing: [],
  calibration: null,
  datasets: [],
  fits: [],
  view: { zoom: 1, pan: [0, 0] },
  ...extra,
});

export const EXPORT_INFO = { appVersion: '0.1.0-test', exportedAt: '2026-10-30T12:00:00.000Z' } as const;

export const EXPORT_PROJECT: Project = {
  schemaVersion: 1,
  app: { name: 'curve-digitizer', version: '0.1.0-test' },
  id: 'p-export',
  name: 'Pump curves, "rev B"',
  created: '2026-10-30T10:00:00.000Z',
  modified: '2026-10-30T11:00:00.000Z',
  settings: { units: 'SI', defaultDpi: 300, snapRadiusPx: 8 },
  sources: [],
  graphs: [
    graph('g1', 'Pump A <250 mm>', {
      calibration: calibration(LINEAR, { x: 'linear', y: 'linear' }, ['m³/h', 'm']),
      datasets: [
        {
          id: 'd1',
          name: 'n = 1450, "rpm"',
          color: '#0072b2',
          mode: 'function',
          param: { name: 'Speed', value: 1450, unit: 'rpm' },
          xUnit: 'm³/h',
          yUnit: 'm',
          sourceRef: 'Catalogue p. 12, Fig 3',
          notes: 'line one\nline two',
          points: [
            point('p3', [1000.5, 650.5]),
            point('p1', [400.5, 450.5], { excludedFromFit: true }),
            point('p2', [700.5, 500.5], { lineWidthPx: 4 }),
            point('p4', [1000.5, 670.5], { outOfRange: true }),
          ],
        },
        {
          id: 'd2',
          name: 'Loop',
          color: '#d55e00',
          mode: 'path',
          xUnit: '',
          yUnit: '',
          sourceRef: '',
          notes: '',
          points: [point('q2', [900, 900]), point('q1', [800, 800])],
        },
      ],
    }),
    graph('g2', 'Log x', {
      calibration: calibration(LOG_X, { x: 'log10', y: 'linear' }, ['', '']),
      datasets: [
        {
          id: 'e1',
          name: 'Decay',
          color: '#009e73',
          mode: 'function',
          xUnit: 'cycles',
          yUnit: 'MPa',
          sourceRef: '',
          notes: '',
          points: [point('r1', [600, 300]), point('r2', [1000, 500])],
        },
      ],
    }),
    graph('g3', 'Not calibrated', {}),
  ],
};
