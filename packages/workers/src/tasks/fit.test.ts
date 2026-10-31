import { describe, expect, it } from 'vitest';
import type { TaskContext } from '../api.ts';
import { fitDataset } from './fit.ts';

const progress: number[] = [];
const ctx: TaskContext = {
  cancelled: false,
  throwIfCancelled: () => undefined,
  progress: (f) => progress.push(f),
  checkpoint: () => Promise.resolve(),
};

const x = Array.from({ length: 30 }, (_, i) => 1 + i);
const y = x.map((t) => 5 * t ** -0.8);

describe('fitDataset', () => {
  it('recommends with progress when no model is given', async () => {
    const out = await fitDataset.run({ x, y, space: { x: 'lin', y: 'lin' } }, ctx);
    expect(out.fits[out.recommended]?.model).toBe('power');
    expect(progress.at(-1)).toBe(1);
  });

  it('fits one chosen model, or reports none', async () => {
    const one = await fitDataset.run({ x, y, space: { x: 'lin', y: 'lin' }, spec: { model: 'exp' } }, ctx);
    expect(one.fits.map((f) => f.model)).toEqual(['exp']);
    expect(one.recommended).toBe(0);
    const none = await fitDataset.run(
      { x: [1, 2], y: [1, 2], space: { x: 'lin', y: 'lin' }, spec: { model: 'exp' } },
      ctx,
    );
    expect(none).toEqual({ fits: [], recommended: -1 });
  });

  it('stops when cancelled', () => {
    const cancelled: TaskContext = {
      ...ctx,
      throwIfCancelled: () => {
        throw new Error('cancelled');
      },
    };
    expect(() => fitDataset.run({ x, y, space: { x: 'lin', y: 'lin' } }, cancelled)).toThrow('cancelled');
  });
});
