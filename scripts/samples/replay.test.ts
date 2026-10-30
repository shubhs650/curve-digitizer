import { describe, expect, it } from 'vitest';
import { limitFor, replay } from './replay.ts';
import type { Sample } from './sample.ts';
import { opsJson, truthJson } from './tiny.ts';
import { parseGroundTruth, parseOps, type Op } from './truth.ts';

// The tiny fixture, registered under a real sample name so the A1/A2 limits apply.
const sample: Sample = {
  name: 'vector-clean',
  dir: '/nowhere',
  truth: parseGroundTruth(truthJson()),
  ops: parseOps(opsJson()),
  image: () => {
    throw new Error('not needed');
  },
};

function opOf<K extends Op['kind']>(kind: K): Extract<Op, { kind: K }> {
  const op = sample.ops.ops.find((o): o is Extract<Op, { kind: K }> => o.kind === kind);
  if (!op) throw new Error(kind);
  return op;
}

describe('replay', () => {
  it('reports todo, naming the task, while a feature has no replayer', async () => {
    expect(await replay(sample, opOf('calibrate'), 'A1', {})).toEqual({
      status: 'todo',
      reason: 'waiting for the calibrate replayer (task 1.3)',
    });
  });

  it('scores the replayer output against the target limit for the sample', async () => {
    const good = await replay(sample, opOf('calibrate'), 'A1', { calibrate: () => ({ residualPx: 0.1 }) });
    expect(good).toMatchObject({ status: 'scored', score: { pass: true } });
    const bad = await replay(sample, opOf('manualPick'), 'A2', {
      manualPick: (op) => Promise.resolve({ points: op.clicks }),
    });
    expect(bad).toMatchObject({ status: 'scored', score: { pass: false, failures: ['RMS distance 2.000 px > 0.5 px'] } });
  });

  it('knows which samples each target is measured on', () => {
    expect(limitFor('A3', 'scan-tilted')).toBe(2);
    expect(() => limitFor('A3', 'dark-bg')).toThrow('A3 is not measured on dark-bg');
  });
});
