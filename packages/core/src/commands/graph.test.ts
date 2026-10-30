import { describe, expect, it } from 'vitest';
import { sampleGraph, sampleProject } from '../testing.ts';
import { CommandError } from './command.ts';
import { addGraph, removeGraph, renameGraph } from './graph.ts';

describe('addGraph', () => {
  it('appends by default and inverts', () => {
    const before = sampleProject();
    const command = addGraph(sampleGraph('g3'));
    const after = command.apply(before);
    expect(after.graphs.map((g) => g.id)).toEqual(['g1', 'g2', 'g3']);
    expect(command.invert(before).apply(after)).toEqual(before);
  });

  it('inserts at an index', () => {
    const after = addGraph(sampleGraph('g0'), 0).apply(sampleProject());
    expect(after.graphs.map((g) => g.id)).toEqual(['g0', 'g1', 'g2']);
  });

  it('rejects a duplicate id', () => {
    expect(() => addGraph(sampleGraph('g1')).apply(sampleProject())).toThrow(CommandError);
  });
});

describe('removeGraph', () => {
  it('removes and inverts back to the same position', () => {
    const before = sampleProject();
    const command = removeGraph('g1');
    const after = command.apply(before);
    expect(after.graphs.map((g) => g.id)).toEqual(['g2']);
    expect(command.invert(before).apply(after)).toEqual(before);
  });

  it('rejects an unknown id', () => {
    expect(() => removeGraph('nope').apply(sampleProject())).toThrow(CommandError);
    expect(() => removeGraph('nope').invert(sampleProject())).toThrow(CommandError);
  });
});

describe('renameGraph', () => {
  it('renames and inverts', () => {
    const before = sampleProject();
    const command = renameGraph('g2', 'Pump curve');
    const after = command.apply(before);
    expect(after.graphs[1]?.name).toBe('Pump curve');
    expect(after.graphs[0]).toBe(before.graphs[0]);
    expect(command.invert(before).apply(after)).toEqual(before);
  });

  it('rejects an unknown id', () => {
    expect(() => renameGraph('nope', 'x').apply(sampleProject())).toThrow(CommandError);
  });
});
