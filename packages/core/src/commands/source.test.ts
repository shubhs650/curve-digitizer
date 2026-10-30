import { describe, expect, it } from 'vitest';
import { deepFreeze, sampleProject } from '../testing.ts';
import type { Project, SourceFile } from '../types.ts';
import { CommandError } from './command.ts';
import { removeGraph } from './graph.ts';
import { addSource, removeSource } from './source.ts';

const pdf: SourceFile = deepFreeze({
  id: 'src2',
  kind: 'pdf',
  fileName: 'chart.pdf',
  sha256: 'a'.repeat(64),
  pageCount: 3,
  embedded: false,
});

/** The fixture with no graph cropping from src1, so src1 may be removed. */
function unreferenced(): Project {
  return removeGraph('g1').apply(sampleProject());
}

describe('addSource', () => {
  it('appends and inverts', () => {
    const before = sampleProject();
    const command = addSource(pdf);
    const after = command.apply(before);
    expect(after.sources.map((s) => s.id)).toEqual(['src1', 'src2']);
    expect(command.invert(before).apply(after)).toEqual(before);
  });

  it('rejects a duplicate id', () => {
    expect(() => addSource({ ...pdf, id: 'src1' }).apply(sampleProject())).toThrow(CommandError);
  });
});

describe('removeSource', () => {
  it('removes and inverts back to the same position', () => {
    const before = addSource(pdf).apply(unreferenced());
    const command = removeSource('src1');
    const after = command.apply(before);
    expect(after.sources.map((s) => s.id)).toEqual(['src2']);
    const restored = command.invert(before).apply(after);
    expect(restored).toEqual(before);
    expect(command.invert(before).invert(after).apply(restored)).toEqual(after);
  });

  it('keeps a source a graph crops from', () => {
    expect(() => removeSource('src1').apply(sampleProject())).toThrow(/still cropped/);
  });

  it('rejects an unknown id', () => {
    expect(() => removeSource('nope').apply(sampleProject())).toThrow(CommandError);
    expect(() => removeSource('nope').invert(sampleProject())).toThrow(CommandError);
  });
});
