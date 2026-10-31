import type { TraceBranch } from '@cd/trace';
import { describe, expect, it } from 'vitest';
import { branchTip, nearestBranch } from './useTraceTool';

const branches: TraceBranch[] = [
  {
    direction: [1, 0],
    preview: [
      [100, 100],
      [110, 100],
    ],
  },
  {
    direction: [0, 1],
    preview: [
      [100, 100],
      [100, 110],
    ],
  },
];

describe('branch picking', () => {
  it('stretches short previews to a clickable length on screen', () => {
    // At 1 screen px per image px a 10 px preview is drawn 36 px long.
    expect(branchTip(branches[0] as TraceBranch, 1)).toEqual([136, 100]);
    // Zoomed in 8×, 10 image px are already 80 screen px.
    expect(branchTip(branches[0] as TraceBranch, 8)).toEqual([110, 100]);
  });

  it('picks the branch whose drawn tip is under the click', () => {
    expect(nearestBranch(branches, [134, 102], 1)).toBe(0);
    expect(nearestBranch(branches, [101, 135], 1)).toBe(1);
    expect(nearestBranch(branches, [120, 120], 1)).toBe(-1);
  });
});
