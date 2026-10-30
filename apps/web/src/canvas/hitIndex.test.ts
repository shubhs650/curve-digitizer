import { describe, expect, it } from 'vitest';
import { HitIndex } from './hitIndex';

const items = [
  { id: 'a', px: [10, 10] },
  { id: 'b', px: [20, 10] },
  { id: 'c', px: [20, 10] },
  { id: 'd', px: [100, 50] },
] as const;

describe('HitIndex', () => {
  const index = new HitIndex(items);

  it('finds the nearest item within the radius', () => {
    expect(index.nearest([12, 11], 5)?.id).toBe('a');
    expect(index.nearest([98, 52], 5)?.id).toBe('d');
    expect(index.nearest([50, 50], 5)).toBeNull();
  });

  it('prefers the later of two coincident items, which is drawn on top', () => {
    expect(index.nearest([20, 10], 1)?.id).toBe('c');
  });

  it('uses a circular radius, not the search box', () => {
    expect(index.nearest([14, 14], 5)).toBeNull();
  });

  it('lists items inside a rectangle given by any two corners', () => {
    expect(index.within([25, 0], [5, 20]).map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('handles an empty set', () => {
    const empty = new HitIndex([]);
    expect(empty.size).toBe(0);
    expect(empty.nearest([0, 0], 10)).toBeNull();
    expect(empty.within([0, 0], [1, 1])).toEqual([]);
  });

  it('stays fast with many points', () => {
    const many = Array.from({ length: 20000 }, (_, i) => ({
      id: i,
      px: [i % 200, Math.floor(i / 200)] as const,
    }));
    const big = new HitIndex(many);
    const t0 = performance.now();
    for (let i = 0; i < 1000; i++) big.nearest([i % 200, i % 100], 3);
    expect(performance.now() - t0).toBeLessThan(100);
  });
});
