import { describe, expect, it } from 'vitest';
import { sampleProject } from '../testing.ts';
import { renameProject, updateSettings } from './project.ts';

describe('renameProject', () => {
  it('applies and inverts', () => {
    const before = sampleProject();
    const command = renameProject('New name');
    const after = command.apply(before);
    expect(after.name).toBe('New name');
    expect(command.invert(before).apply(after)).toEqual(before);
  });
});

describe('updateSettings', () => {
  it('merges the patch and inverts', () => {
    const before = sampleProject();
    const command = updateSettings({ snapRadiusPx: 12 });
    const after = command.apply(before);
    expect(after.settings).toEqual({ ...before.settings, snapRadiusPx: 12 });
    expect(command.invert(before).apply(after)).toEqual(before);
    expect(command.coalesceKey).toBeUndefined();
    expect(updateSettings({ snapRadiusPx: 3 }, 'radius#1').coalesceKey).toBe('radius#1');
  });

  it('inverts the inverse', () => {
    const before = sampleProject();
    const command = updateSettings({ defaultDpi: 600 });
    const after = command.apply(before);
    const inverse = command.invert(before);
    expect(inverse.invert(after).apply(inverse.apply(after))).toEqual(after);
  });
});
