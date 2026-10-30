import { describe, expect, it } from 'vitest';
import { DATASET_PALETTE, nextDatasetColor } from './palette.ts';

describe('nextDatasetColor', () => {
  it('assigns palette colours in order, skipping used ones', () => {
    expect(nextDatasetColor([])).toBe(DATASET_PALETTE[0]);
    expect(nextDatasetColor(['#0072B2'])).toBe(DATASET_PALETTE[1]);
    expect(nextDatasetColor(['#d55e00', '#123456'])).toBe(DATASET_PALETTE[0]);
  });

  it('cycles once every colour is taken', () => {
    expect(nextDatasetColor([...DATASET_PALETTE])).toBe(DATASET_PALETTE[0]);
    expect(nextDatasetColor([...DATASET_PALETTE, '#000000'])).toBe(DATASET_PALETTE[1]);
  });

  it('has ten distinct lowercase hex colours', () => {
    expect(new Set(DATASET_PALETTE).size).toBe(10);
    for (const c of DATASET_PALETTE) expect(c).toMatch(/^#[0-9a-f]{6}$/);
  });
});
