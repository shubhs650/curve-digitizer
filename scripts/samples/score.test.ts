import { describe, expect, it } from 'vitest';
import type { Vec2 } from './geometry.ts';
import { score, TARGETS } from './score.ts';
import { opsJson, truthJson } from './tiny.ts';
import { parseGroundTruth, parseOps, type Op, type OpKind } from './truth.ts';

const ops = parseOps(opsJson()).ops;

function opOf<K extends OpKind>(kind: K): Extract<Op, { kind: K }> {
  const op = ops.find((o): o is Extract<Op, { kind: K }> => o.kind === kind);
  if (!op) throw new Error(kind);
  return op;
}

/** The tiny truth with a second, parallel line 20 px above d1 and a crossing line d3. */
function truth() {
  const t = truthJson();
  const datasets = t['datasets'] as Record<string, unknown>[];
  const d1 = datasets[0];
  if (!d1) throw new Error('tiny fixture has no dataset');
  datasets.push({ ...d1, id: 'd2', centerline: [[10, 30], [90, 30]] });
  datasets.push({ ...d1, id: 'd3', centerline: [[30, 70], [70, 30]] });
  t['intersections'] = [{ datasets: ['d1', 'd3'], px: [50, 50], value: [5, 1], angleDeg: 45 }];
  return parseGroundTruth(t);
}

const along = (y: number, from = 10, to = 90, step = 2): Vec2[] =>
  Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => [from + i * step, y] as const);

describe('acceptance target table', () => {
  it('mirrors docs/ACCEPTANCE_TARGETS.md for every target verified by test:samples', () => {
    const table = Object.fromEntries(Object.entries(TARGETS).map(([id, t]) => [id, [t.opKind, t.limits]]));
    expect(table).toEqual({
      A1: ['calibrate', { 'vector-clean': 0.3, 'sn-family': 0.3 }],
      A2: ['manualPick', { 'vector-clean': 0.5 }],
      A3: ['trace', { 'vector-clean': 1.0, 'scan-tilted': 2.0 }],
      A4: ['trace', { 'sn-family': 0 }],
      A5: ['colourMask', { 'vector-clean': 0.98 }],
      A6: ['xStep', { 'vector-clean': 0.5 }],
    });
  });
});

describe('score', () => {
  const t = truth();

  it('A1: calibration residual against the limit', () => {
    expect(score('A1', 0.3, opOf('calibrate'), { residualPx: 0.29 }, t).pass).toBe(true);
    const fail = score('A1', 0.3, opOf('calibrate'), { residualPx: 0.31 }, t);
    expect(fail.pass).toBe(false);
    expect(fail.failures).toEqual(['RMS residual 0.310 px > 0.3 px']);
  });

  it('A2: snapped picks, one per click, RMS distance to the centerline', () => {
    const pick = opOf('manualPick');
    expect(score('A2', 0.5, pick, { points: [[20, 50.4]] }, t).pass).toBe(true);
    expect(score('A2', 0.5, pick, { points: [[20, 50.6]] }, t).failures).toEqual([
      'RMS distance 0.600 px > 0.5 px',
    ]);
    expect(score('A2', 0.5, pick, { points: [] }, t).failures).toContain('expected 1 points, got 0');
  });

  it('A3: RMS distance plus coverage of the curve between start and end', () => {
    const trace = opOf('trace');
    expect(score('A3', 1, trace, { points: along(50.5), prompted: false }, t).pass).toBe(true);
    expect(score('A3', 1, trace, { points: along(51.5), prompted: false }, t).failures).toEqual([
      'RMS distance 1.500 px > 1 px',
    ]);
    const half = score('A3', 1, trace, { points: along(50, 10, 50), prompted: false }, t);
    expect(half.failures).toEqual(['covers 50.0 % of the curve between start and end, needs ≥ 95 %']);
    expect(score('A3', 1, trace, { points: [], prompted: false }, t).pass).toBe(false);
  });

  it('A4: no prompt, no point on a wrong branch, every intersection crossed', () => {
    const trace = opOf('trace');
    expect(score('A4', 0, trace, { points: along(50), prompted: false }, t).pass).toBe(true);
    expect(score('A4', 0, trace, { points: along(50), prompted: true }, t).failures).toEqual([
      'asked the user to pick a branch',
    ]);
    // Follows d1 to the crossing, then wanders up d3.
    const wrong: Vec2[] = [...along(50, 10, 50), [55, 45], [60, 40], [65, 35], [70, 30]];
    const failures = score('A4', 0, trace, { points: wrong, prompted: false }, t).failures;
    expect(failures[0]).toMatch(/^4 points on a wrong branch \(farthest 20\.0 px\)$/);
    // Stops just before the crossing: never crosses it.
    const short = score('A4', 0, trace, { points: along(50, 10, 44), prompted: false }, t).failures;
    expect(short).toEqual(['does not cross the intersection with d3 at (50.0, 50.0)']);
  });

  it('A5: fraction of the centerline recovered by the selected components', () => {
    const mask = opOf('colourMask');
    expect(score('A5', 0.98, mask, { paths: [along(50.5, 10, 90, 1)] }, t).pass).toBe(true);
    expect(score('A5', 0.98, mask, { paths: [along(50, 10, 80, 1)] }, t).failures).toEqual([
      'recovers 90.0 % of the curve length, needs ≥ 98 %',
    ]);
  });

  it('A6: one point per X, no outliers, RMS distance to the ground-truth point at that X', () => {
    const step = opOf('xStep');
    expect(score('A6', 0.5, step, { points: [[10.3, 50]], outliers: 0 }, t).pass).toBe(true);
    // On the curve but at the wrong X still fails: the sampler must hit the requested X.
    expect(score('A6', 0.5, step, { points: [[12, 50]], outliers: 0 }, t).failures).toEqual([
      'RMS distance 2.000 px > 0.5 px',
    ]);
    expect(score('A6', 0.5, step, { points: [[10, 50]], outliers: 1 }, t).failures).toEqual([
      '1 outliers, needs 0',
    ]);
    expect(score('A6', 0.5, step, { points: [], outliers: 0 }, t).failures).toContain('expected 1 points, got 0');
  });

  it('refuses to score an op of the wrong kind for the target', () => {
    expect(() => score('A1', 0.3, opOf('trace'), { residualPx: 0 } as never, t)).toThrow(/A1 scores calibrate ops, not trace/);
  });
});
