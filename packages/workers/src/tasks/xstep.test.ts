import { canvas, curve, stroke } from '@cd/image/testing';
import { afterEach, describe, expect, it } from 'vitest';
import type { TaskContext } from '../api.ts';
import { clearImageCaches } from './source.ts';
import { sampleCurveXs } from './xstep.ts';

const progress: number[] = [];
const ctx: TaskContext = {
  cancelled: false,
  throwIfCancelled: () => undefined,
  progress: (f) => progress.push(f),
  checkpoint: () => Promise.resolve(),
};

afterEach(() => {
  clearImageCaches();
  progress.length = 0;
});

describe('sampleCurveXs', () => {
  it('samples the processed image at the requested X values', async () => {
    const img = canvas(600, 300, [30, 30, 30]);
    const line = (px: number) => 100 + px / 4;
    stroke(img, curve(line, 30, 570), 3, [250, 250, 250]);
    const source = {
      key: 'g1',
      rgba: { data: img.data.slice().buffer, width: img.width, height: img.height },
    };
    const out = await sampleCurveXs.run(
      {
        source,
        steps: [{ op: 'invert' }],
        options: {
          start: [300, line(300)],
          xs: [0, 50, 100],
          // x = (px − 50) / 5, y = (250 − py) / 2
          matrix: [0.2, 0, -10, 0, -0.5, 125, 0, 0, 1],
          axes: { x: 'linear', y: 'linear' },
        },
      },
      ctx,
    );
    expect(out.points.map((p) => Math.round(p.px?.[0] ?? -1))).toEqual([50, 300, 550]);
    expect(out.points.every((p) => Math.abs((p.px?.[1] ?? 0) - line(p.px?.[0] ?? 0)) < 0.5)).toBe(true);
    expect(progress.at(-1)).toBe(1);
  });
});
