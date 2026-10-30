import { describe, expect, it } from 'vitest';
import { sampleGraph, sampleProject } from '../testing.ts';
import { CommandError } from './command.ts';
import { addGraph, removeGraph, renameGraph, replaceGraphRender } from './graph.ts';

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

describe('replaceGraphRender', () => {
  it('swaps the render, keeps the rest of the graph, and inverts', () => {
    const before = sampleProject();
    const g1 = before.graphs[0];
    if (!g1) throw new Error('fixture has no graph');
    const render = {
      source: {
        kind: 'pdfCrop' as const,
        sourceId: 's1',
        pageIndex: 0,
        rectPt: [10, 20, 110, 70] as const,
        dpi: 600,
        rotation: 0 as const,
      },
      image: { path: 'graphs/g1/render-2.png', width: 834, height: 417 },
      calibration: null,
      datasets: [],
    };
    const command = replaceGraphRender('g1', render);
    expect(command.label).toBe('Re-render graph');
    const after = command.apply(before);
    expect(after.graphs[0]).toEqual({ ...g1, ...render });
    expect(after.graphs[1]).toBe(before.graphs[1]);
    expect(command.invert(before).apply(after)).toEqual(before);
    expect(() => replaceGraphRender('nope', render).apply(before)).toThrow(CommandError);
  });
});
