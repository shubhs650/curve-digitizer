import { afterEach, describe, expect, it } from 'vitest';
import type { TaskContext } from '../api.ts';
import { CancelledError } from '../cancel.ts';
import { processImage } from './process.ts';
import { clearImageCaches, processedCache } from './source.ts';

const progress: number[] = [];
const ctx: TaskContext = {
  cancelled: false,
  throwIfCancelled: () => undefined,
  progress: (f) => progress.push(f),
  checkpoint: () => Promise.resolve(),
};

const source = (key: string) => ({
  key,
  rgba: { data: Uint8ClampedArray.from([200, 100, 50, 255, 0, 0, 0, 255]).buffer, width: 2, height: 1 },
});

afterEach(() => {
  clearImageCaches();
  progress.length = 0;
});

describe('processImage', () => {
  it('runs the stack, reports progress per step and returns an owned copy', async () => {
    const out = await processImage.run(
      { source: source('g1'), steps: [{ op: 'invert' }, { op: 'grayscale' }] },
      ctx,
    );
    expect([out.width, out.height]).toEqual([2, 1]);
    expect(Array.from(new Uint8ClampedArray(out.rgba))).toEqual([131, 131, 131, 255, 255, 255, 255, 255]);
    expect(progress).toEqual([0, 0.5, 1]);
    expect(out.issues).toEqual([]);
    expect(processImage.transferables?.(out)).toEqual([out.rgba]);
    // Transferring the copy must not detach the cached raster.
    expect(processedCache.size).toBe(2);
  });

  it('reuses the decoded source and cached prefixes', async () => {
    await processImage.run({ source: source('g1'), steps: [{ op: 'invert' }] }, ctx);
    // No pixels this time: the worker must have the source cached under the key.
    const out = await processImage.run(
      { source: { key: 'g1' }, steps: [{ op: 'invert' }, { op: 'invert' }] },
      ctx,
    );
    expect(Array.from(new Uint8ClampedArray(out.rgba)).slice(0, 4)).toEqual([200, 100, 50, 255]);
  });

  it('reports skipped steps', async () => {
    const out = await processImage.run({ source: source('g2'), steps: [{ op: 'blur' }] }, ctx);
    expect(out.issues).toEqual([{ index: 0, op: 'blur', message: 'unknown filter "blur"' }]);
  });

  it('fails clearly without pixels for an unknown key', async () => {
    await expect(processImage.run({ source: { key: 'nope' }, steps: [] }, ctx)).rejects.toThrow(
      'image nope was sent without pixels',
    );
  });

  it('stops when cancelled', async () => {
    const cancelling: TaskContext = {
      ...ctx,
      throwIfCancelled: () => {
        throw new CancelledError();
      },
    };
    await expect(
      processImage.run({ source: source('g3'), steps: [{ op: 'invert' }] }, cancelling),
    ).rejects.toThrow(CancelledError);
  });
});
