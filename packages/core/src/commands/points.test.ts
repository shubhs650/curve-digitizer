import { describe, expect, it } from 'vitest';
import { deepFreeze, sampleProject } from '../testing.ts';
import type { Point, Project } from '../types.ts';
import { addDataset } from './dataset.ts';
import type { Command } from './command.ts';
import { CommandError } from './command.ts';
import { insertPoints, removePoints, replacePoints } from './points.ts';

const point = (id: string, px: readonly [number, number] = [1, 2]): Point =>
  deepFreeze({
    id,
    px,
    value: [0, 0],
    sigma: [0, 0],
    excludedFromFit: false,
    outOfRange: false,
    origin: 'manual',
  });

const ids = (project: Project, datasetId = 'd1') =>
  project.graphs[0]?.datasets.find((d) => d.id === datasetId)?.points.map((p) => p.id);

/** apply then invert gives back the original project (U3). */
function expectInvertible(before: Project, command: Command): Project {
  const after = command.apply(before);
  expect(command.invert(before).apply(after)).toEqual(before);
  return after;
}

/** The fixture plus an empty second dataset d2 in g1. */
function twoDatasets(): Project {
  const project = sampleProject();
  const d1 = project.graphs[0]?.datasets[0];
  if (!d1) throw new Error('fixture has no dataset');
  return deepFreeze(addDataset('g1', { ...d1, id: 'd2', name: 'Second', points: [] }).apply(project));
}

describe('insertPoints', () => {
  it('appends or inserts points across datasets, and inverts', () => {
    const before = twoDatasets();
    const command = insertPoints('g1', [
      { datasetId: 'd1', point: point('p9') },
      { datasetId: 'd1', point: point('p0'), index: 0 },
      { datasetId: 'd2', point: point('q1') },
    ]);
    expect(command.label).toBe('Add 3 points');
    const after = expectInvertible(before, command);
    expect(ids(after)).toEqual(['p0', 'p1', 'p2', 'p9']);
    expect(ids(after, 'd2')).toEqual(['q1']);
    expect(insertPoints('g1', [{ datasetId: 'd1', point: point('x') }]).label).toBe('Add point');
  });

  it('rejects a duplicate id and an unknown dataset', () => {
    const before = sampleProject();
    expect(() => insertPoints('g1', [{ datasetId: 'd1', point: point('p1') }]).apply(before)).toThrow(
      CommandError,
    );
    expect(() => insertPoints('g1', [{ datasetId: 'dx', point: point('p8') }]).apply(before)).toThrow(
      CommandError,
    );
  });
});

describe('removePoints', () => {
  it('removes points from several datasets and undo puts each back in place', () => {
    const before = insertPoints('g1', [
      { datasetId: 'd1', point: point('p3') },
      { datasetId: 'd2', point: point('q1') },
      { datasetId: 'd2', point: point('q2') },
    ]).apply(twoDatasets());
    const command = removePoints('g1', [
      { datasetId: 'd2', pointId: 'q1' },
      { datasetId: 'd1', pointId: 'p3' },
      { datasetId: 'd1', pointId: 'p1' },
    ]);
    expect(command.label).toBe('Delete 3 points');
    expect(command.invert(before).label).toBe('Delete 3 points');
    const after = expectInvertible(before, command);
    expect(ids(after)).toEqual(['p2']);
    expect(ids(after, 'd2')).toEqual(['q2']);
  });

  it('rejects an unknown point without changing anything', () => {
    expect(() =>
      removePoints('g1', [
        { datasetId: 'd1', pointId: 'p1' },
        { datasetId: 'd1', pointId: 'nope' },
      ]).apply(sampleProject()),
    ).toThrow(CommandError);
  });
});

describe('replacePoints', () => {
  it('replaces points by id, and inverts to the old versions', () => {
    const before = sampleProject();
    const moved = { ...point('p2', [50, 60]), origin: 'snap' as const, lineWidthPx: 3 };
    const command = replacePoints('g1', [{ datasetId: 'd1', point: moved }], 'Nudge point', 'nudge#1');
    expect(command.coalesceKey).toBe('nudge#1');
    const after = expectInvertible(before, command);
    expect(after.graphs[0]?.datasets[0]?.points[1]).toEqual(moved);
    expect(replacePoints('g1', []).label).toBe('Move 0 points');
  });

  it('rejects a point that is not there', () => {
    expect(() =>
      replacePoints('g1', [{ datasetId: 'd1', point: point('p7') }]).apply(sampleProject()),
    ).toThrow(CommandError);
  });
});
