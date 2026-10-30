import { describe, expect, it } from 'vitest';
import { deepFreeze, sampleProject } from '../testing.ts';
import type { Dataset, Project } from '../types.ts';
import { CommandError } from './command.ts';
import { addDataset, removeDataset, setPointFlags, updateDataset } from './dataset.ts';

const dataset = (id: string): Dataset =>
  deepFreeze({
    id,
    name: `Dataset ${id}`,
    color: '#0072b2',
    mode: 'function',
    xUnit: '',
    yUnit: '',
    sourceRef: '',
    notes: '',
    points: [],
  });

const datasetsOf = (project: Project) => project.graphs[0]?.datasets ?? [];

/** apply then invert gives back the original project. */
function expectInvertible(before: Project, command: ReturnType<typeof addDataset>): Project {
  const after = command.apply(before);
  expect(command.invert(before).apply(after)).toEqual(before);
  return after;
}

describe('addDataset', () => {
  it('appends or inserts, and inverts', () => {
    const before = sampleProject();
    const after = expectInvertible(before, addDataset('g1', dataset('d9')));
    expect(datasetsOf(after).map((d) => d.id)).toEqual(['d1', 'd9']);
    expect(datasetsOf(addDataset('g1', dataset('d0'), 0).apply(before)).map((d) => d.id)).toEqual([
      'd0',
      'd1',
    ]);
  });

  it('rejects a duplicate id and an unknown graph', () => {
    expect(() => addDataset('g1', dataset('d1')).apply(sampleProject())).toThrow(CommandError);
    expect(() => addDataset('nope', dataset('d9')).apply(sampleProject())).toThrow(CommandError);
  });
});

describe('removeDataset', () => {
  it('removes the dataset with its fits and undo restores both in place', () => {
    const before = addDataset('g1', dataset('d0'), 0).apply(sampleProject());
    const after = expectInvertible(before, removeDataset('g1', 'd1'));
    expect(datasetsOf(after).map((d) => d.id)).toEqual(['d0']);
    expect(after.graphs[0]?.fits).toEqual([]);
  });

  it('rejects an unknown dataset', () => {
    expect(() => removeDataset('g1', 'nope').apply(sampleProject())).toThrow(CommandError);
    expect(() => removeDataset('g1', 'nope').invert(sampleProject())).toThrow(CommandError);
  });
});

describe('updateDataset', () => {
  it('changes descriptive fields and inverts only those', () => {
    const before = sampleProject();
    const after = expectInvertible(
      before,
      updateDataset('g1', 'd1', { name: 'T = 400 °C', color: '#d55e00', mode: 'path', xUnit: 'N' }),
    );
    expect(datasetsOf(after)[0]).toMatchObject({
      name: 'T = 400 °C',
      color: '#d55e00',
      mode: 'path',
      xUnit: 'N',
    });
    expect(datasetsOf(after)[0]?.points).toBe(datasetsOf(before)[0]?.points);
  });

  it('sets, replaces and removes the family parameter', () => {
    const before = sampleProject();
    const removed = expectInvertible(before, updateDataset('g1', 'd1', { param: null }));
    expect(datasetsOf(removed)[0]).not.toHaveProperty('param');
    const added = expectInvertible(
      removed,
      updateDataset('g1', 'd1', { param: { name: 'R', value: -1, unit: '' } }),
    );
    expect(datasetsOf(added)[0]?.param).toEqual({ name: 'R', value: -1, unit: '' });
  });

  it('carries the coalesce key', () => {
    expect(updateDataset('g1', 'd1', { notes: 'a' }, 'k').coalesceKey).toBe('k');
    expect(updateDataset('g1', 'd1', { notes: 'a' })).not.toHaveProperty('coalesceKey');
  });
});

describe('setPointFlags', () => {
  it('flags points and restores each point’s own flags', () => {
    const before = sampleProject();
    const ids = datasetsOf(before)[0]?.points.map((p) => p.id) ?? [];
    expect(ids.length).toBeGreaterThan(0);
    const after = expectInvertible(before, setPointFlags('g1', 'd1', ids, { excludedFromFit: true }));
    expect(datasetsOf(after)[0]?.points.every((p) => p.excludedFromFit)).toBe(true);
    const command = setPointFlags('g1', 'd1', ids, { excludedFromFit: true });
    const inverse = command.invert(before);
    expect(inverse.invert(after).apply(inverse.apply(after))).toEqual(after);
  });

  it('rejects an unknown point', () => {
    expect(() => setPointFlags('g1', 'd1', ['nope'], { outOfRange: true }).apply(sampleProject())).toThrow(
      CommandError,
    );
  });
});
