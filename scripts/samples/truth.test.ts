import { describe, expect, it } from 'vitest';
import { opsJson, truthJson } from './tiny.ts';
import { checkOps, parseGroundTruth, parseOps, SampleFormatError } from './truth.ts';

describe('ground-truth.json parser', () => {
  it('accepts a well-formed file', () => {
    const truth = parseGroundTruth(truthJson());
    expect(truth.datasets[0]?.centerline).toHaveLength(2);
    expect(truth.axes.y.unit).toBe('MPa');
    expect(truth.datasets[0]?.dash).toBeNull();
  });

  it('reports the JSON path of the first error', () => {
    const bad = truthJson();
    const axes = bad['axes'] as Record<string, Record<string, unknown>>;
    axes['x'] = { ...axes['x'], type: 'polar' };
    expect(() => parseGroundTruth(bad)).toThrow(new SampleFormatError('$.axes.x.type', 'expected one of linear, log10'));
    const shortMatrix = { ...truthJson(), axisToPx: [1, 2, 3] };
    expect(() => parseGroundTruth(shortMatrix)).toThrow(/\$\.axisToPx: expected 9 numbers/);
    expect(() => parseGroundTruth({ ...truthJson(), groundTruthVersion: 2 })).toThrow(/unsupported version 2/);
  });

  it('rejects duplicate dataset ids and intersections naming unknown datasets', () => {
    const t = truthJson();
    const ds = (t['datasets'] as unknown[])[0];
    expect(() => parseGroundTruth({ ...t, datasets: [ds, ds] })).toThrow(/\$\.datasets\[1\]\.id: duplicate id d1/);
    const crossing = { datasets: ['d1', 'd9'], px: [1, 1], value: [1, 1], angleDeg: 30 };
    expect(() => parseGroundTruth({ ...t, intersections: [crossing] })).toThrow(
      /\$\.intersections\[0\]\.datasets\[1\]: unknown dataset d9/,
    );
  });
});

describe('ops.json parser', () => {
  it('accepts every op kind', () => {
    const ops = parseOps(opsJson());
    expect(ops.ops.map((op) => op.kind)).toEqual(['calibrate', 'trace', 'colourMask', 'xStep', 'manualPick']);
  });

  it('rejects unknown kinds and unknown acceptance targets', () => {
    const o = opsJson();
    expect(() => parseOps({ ...o, ops: [{ id: 'x', kind: 'teleport', targets: [] }] })).toThrow(
      /\$\.ops\[0\]\.kind: expected one of calibrate, manualPick, trace, colourMask, xStep/,
    );
    expect(() =>
      parseOps({ ...o, ops: [{ id: 'x', kind: 'trace', targets: ['A42'], datasetId: 'd1', start: [0, 0], end: [1, 1] }] }),
    ).toThrow(/\$\.ops\[0\]\.targets\[0\]: expected one of A1/);
  });

  it('cross-checks ops against the ground truth', () => {
    const truth = parseGroundTruth(truthJson());
    expect(() => {
      checkOps(parseOps(opsJson()), truth);
    }).not.toThrow();

    const wrongSample = parseOps({ ...opsJson(), sample: 'other' });
    expect(() => {
      checkOps(wrongSample, truth);
    }).toThrow(/sample other does not match tiny/);

    const o = opsJson();
    const ops = o['ops'] as Record<string, unknown>[];
    ops[1] = { ...ops[1], datasetId: 'd7' };
    expect(() => {
      checkOps(parseOps(o), truth);
    }).toThrow(/trace-d1: unknown dataset d7/);

    const outside = opsJson();
    (outside['ops'] as Record<string, unknown>[])[2] = { ...ops[2], pick: [150, 10] };
    expect(() => {
      checkOps(parseOps(outside), truth);
    }).toThrow(/mask-d1: \[150, 10\] is outside the 100 × 50 image/);

    const offSample = opsJson();
    (offSample['ops'] as Record<string, unknown>[])[3] = { ...ops[3], xs: [2] };
    expect(() => {
      checkOps(parseOps(offSample), truth);
    }).toThrow(/xstep-d1: X 2 is not a ground-truth sample of d1/);
  });
});
