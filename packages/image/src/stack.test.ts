import { describe, expect, it, vi } from 'vitest';
import { FILTER_OPS } from './ops.ts';
import { applyStack, canonicalJson, RasterCache, stackHash } from './stack.ts';
import { canvas, rgbAt } from './testing.ts';

describe('canonicalJson / stackHash', () => {
  it('ignores key order and undefined values', () => {
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: undefined }] })).toBe('{"a":[{"d":2}],"b":1}');
    expect(stackHash([{ op: 'gridSuppress', minRunPx: 200, tolerance: 2 }])).toBe(
      stackHash([{ tolerance: 2, op: 'gridSuppress', minRunPx: 200 }]),
    );
  });

  it('changes with any step or parameter', () => {
    const base = stackHash([{ op: 'grayscale' }, { op: 'invert' }]);
    expect(stackHash([{ op: 'invert' }, { op: 'grayscale' }])).not.toBe(base);
    expect(stackHash([{ op: 'grayscale' }])).not.toBe(base);
    expect(stackHash([{ op: 'contrast', value: 1.3 }])).not.toBe(
      stackHash([{ op: 'contrast', value: 1.31 }]),
    );
    expect(stackHash([])).toMatch(/^[0-9a-f]{14}$/);
  });
});

describe('RasterCache', () => {
  const raster = (bytes: number) => ({
    width: bytes / 4,
    height: 1,
    channels: 4 as const,
    data: new Uint8ClampedArray(bytes),
  });

  it('evicts the least recently used entries beyond its byte budget', () => {
    const cache = new RasterCache(100);
    cache.set('a', raster(40));
    cache.set('b', raster(40));
    expect(cache.get('a')).toBeDefined();
    cache.set('c', raster(40));
    expect(cache.get('b')).toBeUndefined();
    expect([cache.size, cache.bytes]).toEqual([2, 80]);
    cache.set('huge', raster(200));
    expect(cache.get('huge')).toBeUndefined();
    cache.set('a', raster(20));
    expect(cache.bytes).toBe(60);
    cache.clear();
    expect([cache.size, cache.bytes]).toEqual([0, 0]);
  });
});

describe('applyStack', () => {
  const source = () => {
    const img = canvas(4, 3, [200, 100, 50]);
    return img;
  };

  it('runs the steps in order and leaves the source untouched', async () => {
    const src = source();
    const before = Uint8ClampedArray.from(src.data);
    const { raster, hash, issues } = await applyStack(src, [{ op: 'grayscale' }, { op: 'invert' }]);
    // luma(200, 100, 50) = 124.25 → 124 → inverted 131 (Uint8ClampedArray rounds halves to even).
    expect(rgbAt(raster, 0, 0)).toEqual([131, 131, 131]);
    expect(hash).toBe(stackHash([{ op: 'grayscale' }, { op: 'invert' }]));
    expect(issues).toEqual([]);
    expect(src.data).toEqual(before);
  });

  it('returns the source itself for an empty stack', async () => {
    const src = source();
    expect((await applyStack(src, [])).raster).toBe(src);
    const grey = { width: 1, height: 1, channels: 1 as const, data: Uint8Array.from([9]) };
    expect(Array.from((await applyStack(grey, [])).raster.data)).toEqual([9, 9, 9, 255]);
  });

  it('skips unknown and invalid steps and reports them', async () => {
    const { raster, issues } = await applyStack(source(), [
      { op: 'sharpen', amount: 3 },
      { op: 'invert' },
      { op: 'brightness', value: 9 },
    ]);
    expect(rgbAt(raster, 0, 0)).toEqual([55, 155, 205]);
    expect(issues).toEqual([
      { index: 0, op: 'sharpen', message: 'unknown filter "sharpen"' },
      { index: 2, op: 'brightness', message: 'value must be between -1 and 1' },
    ]);
  });

  it('reuses the longest cached prefix', async () => {
    const cache = new RasterCache(1 << 20);
    const spy = vi.spyOn(FILTER_OPS.grayscale, 'apply');
    const steps = [{ op: 'grayscale' }, { op: 'invert' }];
    await applyStack(source(), steps, { cache, sourceKey: 'g1' });
    expect(spy).toHaveBeenCalledTimes(1);
    const before = vi.fn();
    const more = await applyStack(source(), [...steps, { op: 'brightness', value: 0.1 }], {
      cache,
      sourceKey: 'g1',
      beforeStep: before,
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(before.mock.calls).toEqual([[2, 3]]);
    expect(rgbAt(more.raster, 0, 0)).toEqual([156, 156, 156]);
    // Another source does not share entries.
    await applyStack(source(), steps, { cache, sourceKey: 'g2' });
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });

  it('propagates a throw from tick (cancellation)', async () => {
    await expect(
      applyStack(source(), [{ op: 'invert' }], {
        tick: () => {
          throw new Error('cancelled');
        },
      }),
    ).rejects.toThrow('cancelled');
  });
});
