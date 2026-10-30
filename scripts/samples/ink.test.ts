import { describe, expect, it } from 'vitest';
import { polyline } from './geometry.ts';
import { bilinear, hexToRgb, strokeOffsets } from './ink.ts';
import type { RasterImage } from './png.ts';

/** 60×30 white RGB image with a black stroke covering rows `rows`. */
function stroke(rows: readonly number[]): RasterImage {
  const width = 60;
  const height = 30;
  const data = new Uint8Array(width * height * 3).fill(255);
  for (const y of rows) data.fill(0, y * width * 3, (y + 1) * width * 3);
  return { width, height, channels: 3, data };
}

describe('ink probes', () => {
  it('parses hex colours', () => {
    expect(hexToRgb('#1f77b4')).toEqual([31, 119, 180]);
    expect(() => hexToRgb('blue')).toThrow(/#rrggbb/);
  });

  it('interpolates between pixel centres (ADR 24)', () => {
    const img: RasterImage = { width: 2, height: 1, channels: 1, data: Uint8Array.from([0, 100]) };
    expect(bilinear(img, 0.5, 0.5)).toEqual([0, 0, 0]);
    expect(bilinear(img, 1.0, 0.5)).toEqual([50, 50, 50]);
    expect(bilinear(img, 1.5, 0.5)).toEqual([100, 100, 100]);
    expect(bilinear(img, -3, 9)).toEqual([0, 0, 0]);
  });

  it('finds no offset when the centerline is the stroke centre', () => {
    // Rows 9..11 are ink, so the stroke spans y ∈ [9, 12) and its centre is y = 10.5.
    const img = stroke([9, 10, 11]);
    const line = polyline([
      [5, 10.5],
      [55, 10.5],
    ]);
    const probes = strokeOffsets(img, line, { ink: [0, 0, 0], lineWidthPx: 3, spacingPx: 5 });
    expect(probes.length).toBeGreaterThan(5);
    for (const p of probes) expect(Math.abs(p.offset)).toBeLessThan(0.02);
  });

  it('measures a half-pixel error in the centerline', () => {
    const img = stroke([9, 10, 11]);
    const line = polyline([
      [5, 11],
      [55, 11],
    ]);
    const probes = strokeOffsets(img, line, { ink: [0, 0, 0], lineWidthPx: 3, spacingPx: 5 });
    for (const p of probes) expect(Math.abs(p.offset)).toBeCloseTo(0.5, 1);
  });

  it('skips probes the caller excludes and probes with no contrast', () => {
    const img = stroke([9, 10, 11]);
    const line = polyline([
      [5, 10.5],
      [55, 10.5],
    ]);
    const all = strokeOffsets(img, line, { ink: [0, 0, 0], lineWidthPx: 3, spacingPx: 5 });
    const some = strokeOffsets(img, line, {
      ink: [0, 0, 0],
      lineWidthPx: 3,
      spacingPx: 5,
      skip: (s) => s < 25,
    });
    expect(some.length).toBeLessThan(all.length);
    expect(some.every((p) => p.s >= 25)).toBe(true);
    const blank = stroke([]);
    expect(strokeOffsets(blank, line, { ink: [255, 255, 255], lineWidthPx: 3, spacingPx: 5 })).toEqual([]);
  });
});
