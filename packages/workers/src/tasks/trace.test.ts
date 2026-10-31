import { canvas, curve, stroke } from '@cd/image/testing';
import { NoCurveError } from '@cd/trace';
import { afterEach, describe, expect, it } from 'vitest';
import type { TaskContext } from '../api.ts';
import { clearImageCaches, processedCache } from './source.ts';
import { traceCurve } from './trace.ts';

const progress: number[] = [];
let checkpoints = 0;
const ctx: TaskContext = {
  cancelled: false,
  throwIfCancelled: () => undefined,
  progress: (f) => progress.push(f),
  checkpoint: () => {
    checkpoints++;
    return Promise.resolve();
  },
};

const image = () => {
  const img = canvas(800, 300, [30, 30, 30]);
  stroke(
    img,
    curve((x) => 150 + 80 * Math.sin(x / 90), 20, 780),
    3,
    [250, 250, 250],
  );
  return { key: 'g1', rgba: { data: img.data.slice().buffer, width: img.width, height: img.height } };
};

afterEach(() => {
  clearImageCaches();
  progress.length = 0;
  checkpoints = 0;
});

describe('traceCurve', () => {
  it('traces on the processed image and reports monotonic progress to 1', async () => {
    const out = await traceCurve.run(
      { source: image(), steps: [{ op: 'invert' }], options: { start: [40, 150 + 80 * Math.sin(40 / 90)] } },
      ctx,
    );
    expect(out.status).toBe('done');
    // White on dark, inverted: the tracer saw a black curve.
    expect(out.color[0]).toBeLessThan(40);
    const xs = out.points.map((p) => p.px[0]);
    expect(Math.min(...xs)).toBeLessThan(25);
    expect(Math.max(...xs)).toBeGreaterThan(775);
    expect(progress.every((f, i) => i === 0 || f >= (progress[i - 1] ?? 0))).toBe(true);
    expect(progress[progress.length - 1]).toBe(1);
    expect(checkpoints).toBeGreaterThan(1);
    expect(processedCache.size).toBe(1);
  });

  it('rejects with NoCurveError away from any curve', async () => {
    await expect(
      traceCurve.run({ source: image(), steps: [], options: { start: [400, 20] } }, ctx),
    ).rejects.toThrow(NoCurveError);
  });
});
