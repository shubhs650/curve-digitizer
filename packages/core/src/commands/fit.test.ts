import { describe, expect, it } from 'vitest';
import { deepFreeze, sampleProject } from '../testing.ts';
import type { Fit, Project } from '../types.ts';
import { CommandError } from './command.ts';
import { setDatasetFit } from './fit.ts';

const fit = (id: string, datasetId = 'd1'): Fit =>
  deepFreeze({
    id,
    datasetId,
    model: 'poly',
    space: { x: 'lin', y: 'lin' },
    params: { c: [1, 2] },
    domain: [0, 10],
    stats: { n: 5, r2: 0.99, rmse: 0.1, aicc: -12 },
    recommended: true,
  });

const fitsOf = (project: Project) => project.graphs[0]?.fits ?? [];

function expectInvertible(before: Project, command: ReturnType<typeof setDatasetFit>): Project {
  const after = command.apply(before);
  expect(command.invert(before).apply(after)).toEqual(before);
  return after;
}

describe('setDatasetFit', () => {
  it("replaces the dataset's fit, keeps other datasets' fits, and inverts", () => {
    const before = sampleProject();
    expect(fitsOf(before).map((f) => f.datasetId)).toContain('d1');
    const after = expectInvertible(before, setDatasetFit('g1', 'd1', fit('f9')));
    expect(
      fitsOf(after)
        .filter((f) => f.datasetId === 'd1')
        .map((f) => f.id),
    ).toEqual(['f9']);
  });

  it('removes the fit with null, and undo puts the old one back in place', () => {
    const before = sampleProject();
    const after = expectInvertible(before, setDatasetFit('g1', 'd1', null));
    expect(fitsOf(after).filter((f) => f.datasetId === 'd1')).toEqual([]);
  });

  it('rejects an unknown dataset and a fit for another dataset', () => {
    expect(() => setDatasetFit('g1', 'nope', null).apply(sampleProject())).toThrow(CommandError);
    expect(() => setDatasetFit('g1', 'd1', fit('f9', 'd2')).apply(sampleProject())).toThrow(CommandError);
  });
});
