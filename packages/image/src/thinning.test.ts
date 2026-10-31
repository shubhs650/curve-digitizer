import { describe, expect, it } from 'vitest';
import fixtures from '../fixtures/filters.json';
import { thin } from './thinning.ts';

describe('thin (Zhang–Suen)', () => {
  it.each(fixtures.thinning.map((c) => [c.name, c] as const))(
    'matches the reference skeleton (%s)',
    (_, c) => {
      let ticks = 0;
      const result = thin({ width: c.width, height: c.height, data: Uint8Array.from(c.mask) }, () => ticks++);
      expect(Array.from(result.data)).toEqual(c.skeleton);
      expect(ticks).toBeGreaterThan(0);
    },
  );

  it('reduces a thick bar to a one-pixel line along its middle', () => {
    const bar = fixtures.thinning.find((c) => c.name === 'bar');
    if (!bar) throw new Error('missing fixture');
    const result = thin({ width: bar.width, height: bar.height, data: Uint8Array.from(bar.mask) });
    for (let x = 5; x < 18; x++) {
      const column = [...Array(bar.height).keys()].filter((y) => result.data[y * bar.width + x]);
      expect(column).toEqual([6]);
    }
  });

  it('does not modify its input', () => {
    const mask = { width: 3, height: 3, data: Uint8Array.from([1, 1, 1, 1, 1, 1, 1, 1, 1]) };
    thin(mask);
    expect(Array.from(mask.data)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1]);
  });
});
