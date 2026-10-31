import { describe, expect, it } from 'vitest';
import { sampleProject } from '../testing.ts';
import { CommandError } from './command.ts';
import { setProcessing } from './processing.ts';

describe('setProcessing', () => {
  it('replaces the stack of one graph and inverts', () => {
    const before = sampleProject();
    const command = setProcessing(
      'g1',
      [{ op: 'grayscale' }, { op: 'despeckle', radius: 1 }],
      'Enhance',
      'k',
    );
    const after = command.apply(before);
    expect(after.graphs[0]?.processing).toEqual([{ op: 'grayscale' }, { op: 'despeckle', radius: 1 }]);
    expect(after.graphs[1]).toBe(before.graphs[1]);
    expect(command.label).toBe('Enhance');
    expect(command.coalesceKey).toBe('k');
    expect(command.invert(before).apply(after)).toEqual(before);
  });

  it('rejects an unknown graph', () => {
    expect(() => setProcessing('nope', []).apply(sampleProject())).toThrow(CommandError);
    expect(() => setProcessing('nope', []).invert(sampleProject())).toThrow(CommandError);
  });
});
