import { describe, expect, it } from 'vitest';
import { parseStep } from './ops.ts';
import { enhanceForTracing, isDarkBackground } from './presets.ts';
import { canvas, stroke } from './testing.ts';

describe('enhanceForTracing', () => {
  it('is grayscale, despeckle, grid suppression and a contrast stretch, all valid', () => {
    const steps = enhanceForTracing(2400, 1600);
    expect(steps.map((s) => s.op)).toEqual(['grayscale', 'despeckle', 'gridSuppress', 'contrast']);
    expect(steps[2]).toEqual({ op: 'gridSuppress', minRunPx: 800, tolerance: 2 });
    for (const step of steps) expect(parseStep(step).ok).toBe(true);
    expect(enhanceForTracing(8, 8)[2]).toMatchObject({ minRunPx: 10 });
  });
});

describe('isDarkBackground', () => {
  it('reads the paper from the median', () => {
    const dark = canvas(40, 40, [30, 34, 39]);
    stroke(
      dark,
      [
        [0, 20],
        [40, 20],
      ],
      3,
      [255, 220, 100],
    );
    expect(isDarkBackground(dark)).toBe(true);
    const light = canvas(40, 40, [240, 230, 205]);
    stroke(
      light,
      [
        [0, 20],
        [40, 20],
      ],
      3,
      [0, 0, 0],
    );
    expect(isDarkBackground(light)).toBe(false);
    expect(isDarkBackground({ width: 0, height: 0, channels: 1, data: new Uint8Array(0) })).toBe(false);
  });
});
