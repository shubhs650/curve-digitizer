import { canvas, curve, stroke } from '@cd/image/testing';
import type { Mat3 } from '@cd/math';
import { describe, expect, it } from 'vitest';
import { NoCurveError } from './guided.ts';
import { flagOutliers, sampleXSteps, xAt } from './xstep.ts';

const BLUE: [number, number, number] = [31, 119, 180];
const ORANGE: [number, number, number] = [255, 127, 14];
const GREY: [number, number, number] = [200, 200, 200];

// Axis space: x = (px − 50) / 5 (0…100 over 500 px), y = (250 − py) / 2 (0…100 over 200 px).
const M: Mat3 = [0.2, 0, -10, 0, -0.5, 125, 0, 0, 1];
const LINEAR = { x: 'linear', y: 'linear' } as const;
const toPx = (x: number) => 50 + 5 * x;
const wave = (px: number) => 150 + 50 * Math.sin(px / 60);

describe('sampleXSteps', () => {
  it('places one centreline point at each requested X', async () => {
    const img = canvas(600, 300);
    for (let x = 50; x <= 550; x += 50)
      stroke(
        img,
        [
          [x, 0],
          [x, 300],
        ],
        1,
        GREY,
      );
    stroke(img, curve(wave, 30, 570), 3, BLUE);
    // Every 10 px: dense enough for the wave that no point stands off its neighbours' chord.
    const xs = Array.from({ length: 51 }, (_, i) => 2 * i);
    const result = await sampleXSteps(img, { start: [300, wave(300)], xs, matrix: M, axes: LINEAR });
    expect(result.points.map((p) => p.x)).toEqual(xs);
    for (const p of result.points) {
      expect(p.px).not.toBeNull();
      if (!p.px) continue;
      expect(Math.abs(p.px[0] - toPx(p.x))).toBeLessThan(1e-6);
      expect(Math.abs(p.px[1] - wave(p.px[0]))).toBeLessThan(0.4);
      expect(p.outlier).toBe(false);
      expect(p.lineWidthPx).toBeGreaterThan(2);
    }
  });

  it('follows the picked curve through a crossing, not the other one', async () => {
    const img = canvas(600, 300);
    stroke(img, curve(wave, 30, 570), 3, BLUE);
    stroke(
      img,
      curve((px) => 60 + px / 3, 30, 570),
      3,
      BLUE,
    );
    const xs = Array.from({ length: 21 }, (_, i) => i * 5);
    const result = await sampleXSteps(img, { start: [100, wave(100)], xs, matrix: M, axes: LINEAR });
    for (const p of result.points) {
      expect(p.px).not.toBeNull();
      expect(Math.abs((p.px?.[1] ?? 0) - wave(toPx(p.x)))).toBeLessThan(1);
    }
  });

  it('leaves X values outside the traced curve empty', async () => {
    const img = canvas(600, 300);
    stroke(img, curve(wave, 150, 450), 3, ORANGE);
    const result = await sampleXSteps(img, {
      start: [300, wave(300)],
      xs: [0, 30, 50, 70, 100],
      matrix: M,
      axes: LINEAR,
    });
    expect(result.points.map((p) => p.px !== null)).toEqual([false, true, true, true, false]);
  });

  it('works on log axes', async () => {
    const img = canvas(600, 300);
    stroke(img, curve(wave, 30, 570), 3, BLUE);
    // log10 x from 0 (1) to 2 (100) over px 50…550.
    const logM: Mat3 = [0.004, 0, -0.2, 0, -0.5, 125, 0, 0, 1];
    const result = await sampleXSteps(img, {
      start: [300, wave(300)],
      xs: [1, 10, 100],
      matrix: logM,
      axes: { x: 'log10', y: 'linear' },
    });
    expect(result.points.map((p) => Math.round(p.px?.[0] ?? -1))).toEqual([50, 300, 550]);
  });

  it('throws NoCurveError away from any curve', async () => {
    const img = canvas(200, 100);
    await expect(
      sampleXSteps(img, { start: [100, 50], xs: [1], matrix: M, axes: LINEAR }),
    ).rejects.toBeInstanceOf(NoCurveError);
  });
});

describe('xAt', () => {
  it('interpolates where a polyline crosses an axis-space X, nearest a hint when it crosses more than once', () => {
    const path = [
      [0, 0],
      [10, 10],
      [0, 20],
    ] as const;
    const identity: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    expect(xAt(path, identity, 5, null)).toEqual({ px: [5, 5], segment: 0 });
    expect(xAt(path, identity, 5, [5, 15])).toEqual({ px: [5, 15], segment: 1 });
    expect(xAt(path, identity, 11, null)).toBeNull();
  });
});

describe('flagOutliers', () => {
  it('flags a point that jumps off its neighbours, skipping missing ones, and not a smooth bend', () => {
    const flat = [0, 50, 100, 150, 200, 250].map((x): [number, number] => [x, 100]);
    flat[3] = [150, 60];
    expect(flagOutliers([...flat.slice(0, 2), null, ...flat.slice(2)])).toEqual([
      false,
      false,
      false,
      false,
      true,
      false,
      false,
    ]);
    // A parabola sampled every 50 px: the sagitta is a small share of the chord.
    const bend = [0, 50, 100, 150, 200].map((x): [number, number] => [x, ((x - 100) * (x - 100)) / 200]);
    expect(flagOutliers(bend)).toEqual([false, false, false, false, false]);
    // A smaller jump than the minimum is kept.
    expect(
      flagOutliers([
        [0, 0],
        [50, -8],
        [100, 0],
      ]),
    ).toEqual([false, false, false]);
  });
});
