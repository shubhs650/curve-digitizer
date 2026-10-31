import { canvas, curve, stroke } from '@cd/image/testing';
import { NoCurveError } from '@cd/trace';
import { afterEach, describe, expect, it } from 'vitest';
import type { TaskContext } from '../api.ts';
import { maskCurves } from './mask.ts';
import { clearImageCaches, processedCache } from './source.ts';

const progress: number[] = [];
const ctx: TaskContext = {
  cancelled: false,
  throwIfCancelled: () => undefined,
  progress: (f) => progress.push(f),
  checkpoint: () => Promise.resolve(),
};

const upper = (x: number) => 80 + 30 * Math.sin(x / 60);
const lower = (x: number) => 220 - x / 8;

/** Two light curves on a dark background. */
const image = () => {
  const img = canvas(600, 300, [30, 30, 30]);
  stroke(img, curve(upper, 20, 580), 3, [250, 250, 250]);
  stroke(img, curve(lower, 20, 580), 3, [250, 250, 250]);
  return { key: 'g1', rgba: { data: img.data.slice().buffer, width: img.width, height: img.height } };
};

afterEach(() => {
  clearImageCaches();
  progress.length = 0;
});

describe('maskCurves', () => {
  it('samples the colour on the processed image and preselects the component under the pick', async () => {
    const out = await maskCurves.run(
      { source: image(), steps: [{ op: 'invert' }], pick: [300, lower(300)] },
      ctx,
    );
    // Inverted: the curves are dark.
    expect(out.color[0]).toBeLessThan(40);
    expect(out.components).toHaveLength(2);
    const picked = out.components[out.picked];
    expect(picked?.path.every((p) => Math.abs(p[1] - lower(p[0])) < 1.5)).toBe(true);
    expect(progress.every((f, i) => i === 0 || f >= (progress[i - 1] ?? 0))).toBe(true);
    expect(progress.at(-1)).toBe(1);
    expect(processedCache.size).toBe(1);
  });

  it('uses a given colour and tolerance', async () => {
    const out = await maskCurves.run(
      {
        source: image(),
        steps: [],
        pick: [300, upper(300)],
        color: [250, 250, 250],
        options: { tolerance: 20 },
      },
      ctx,
    );
    expect(out.tolerance).toBe(20);
    expect(out.components).toHaveLength(2);
    expect(out.components[out.picked]?.path.every((p) => Math.abs(p[1] - upper(p[0])) < 1.5)).toBe(true);
  });

  it('rejects with NoCurveError when the pick is on the paper', async () => {
    await expect(maskCurves.run({ source: image(), steps: [], pick: [300, 10] }, ctx)).rejects.toThrow(
      NoCurveError,
    );
  });
});
