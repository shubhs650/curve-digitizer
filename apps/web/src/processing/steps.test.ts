import { describe, expect, it } from 'vitest';
import {
  hasInvert,
  insertStep,
  moveStep,
  newStep,
  opLabel,
  removeStep,
  stepProblem,
  updateStep,
} from './steps';

const stack = [{ op: 'grayscale' }, { op: 'despeckle', radius: 1 }, { op: 'invert' }];

describe('stack edits', () => {
  it('creates steps with defaults', () => {
    expect(newStep('gridSuppress')).toEqual({ op: 'gridSuppress', minRunPx: 200, tolerance: 2 });
    expect(newStep('threshold')).toEqual({ op: 'threshold', level: null });
  });

  it('inserts, removes and moves', () => {
    expect(insertStep(stack, { op: 'brightness', value: 0 }).map((s) => s.op)).toEqual([
      'grayscale',
      'despeckle',
      'invert',
      'brightness',
    ]);
    expect(removeStep(stack, 1).map((s) => s.op)).toEqual(['grayscale', 'invert']);
    expect(moveStep(stack, 2, -1).map((s) => s.op)).toEqual(['grayscale', 'invert', 'despeckle']);
    expect(moveStep(stack, 0, -1).map((s) => s.op)).toEqual(['grayscale', 'despeckle', 'invert']);
    expect(moveStep(stack, 0, 5).map((s) => s.op)).toEqual(['despeckle', 'invert', 'grayscale']);
  });

  it('patches parameters and drops undefined keys', () => {
    expect(updateStep(stack, 1, { radius: 3 })[1]).toEqual({ op: 'despeckle', radius: 3 });
    expect(updateStep([{ op: 'threshold', level: 0.4 }], 0, { level: undefined })[0]).toEqual({
      op: 'threshold',
    });
  });

  it('labels and validates steps', () => {
    expect(opLabel('gridSuppress')).toBe('Suppress grid lines');
    expect(opLabel('sharpen')).toBe('Unknown filter "sharpen"');
    expect(stepProblem({ op: 'contrast', value: 99 })).toBe('value must be between 0 and 10');
    expect(stepProblem({ op: 'invert' })).toBeNull();
    expect(hasInvert(stack)).toBe(true);
    expect(hasInvert([])).toBe(false);
  });
});
