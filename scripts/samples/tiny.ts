// A tiny sample (one horizontal line) for the harness's own unit tests.

export function truthJson(): Record<string, unknown> {
  return {
    groundTruthVersion: 1,
    sample: 'tiny',
    description: 'A two-point line.',
    generator: 'test',
    pixelConvention: 'ADR 25',
    image: { path: 'source.png', width: 100, height: 50 },
    axes: {
      x: { type: 'linear', label: 'X', min: 0, max: 10 },
      y: { type: 'log10', label: 'Y', unit: 'MPa', min: 1, max: 100 },
    },
    axisToPx: [10, 0, 0, 0, -25, 50, 0, 0, 1],
    pxToAxis: [0.1, 0, 0, 0, -0.04, 2, 0, 0, 1],
    ticks: [{ axis: 'x', value: 5, px: [50, 50] }],
    datasets: [
      {
        id: 'd1',
        name: 'Line',
        color: '#000000',
        lineWidthPx: 2,
        dash: null,
        mode: 'function',
        xUnit: '',
        yUnit: 'MPa',
        model: { family: 'poly', expression: 'y = 1', params: { c: [1] } },
        domain: [1, 9],
        samples: [{ value: [1, 1], px: [10, 50] }],
        centerline: [
          [10, 50],
          [90, 50],
        ],
      },
    ],
    intersections: [],
  };
}

export function opsJson(): Record<string, unknown> {
  return {
    opsVersion: 1,
    sample: 'tiny',
    ops: [
      {
        id: 'calibrate',
        kind: 'calibrate',
        targets: ['A1'],
        model: 'affine',
        points: [{ px: [10, 50], value: [1, 1] }],
      },
      { id: 'trace-d1', kind: 'trace', targets: [], datasetId: 'd1', start: [10, 50], end: [90, 50] },
      { id: 'mask-d1', kind: 'colourMask', targets: ['A5'], datasetId: 'd1', pick: [50.5, 49.5] },
      { id: 'xstep-d1', kind: 'xStep', targets: ['A6'], datasetId: 'd1', start: [10, 50], xs: [1] },
      {
        id: 'pick-d1',
        kind: 'manualPick',
        targets: ['A2'],
        datasetId: 'd1',
        snap: true,
        clicks: [[20, 48]],
      },
    ],
  };
}
