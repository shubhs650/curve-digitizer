import { describe, expect, it } from 'vitest';
import fixtures from '../fixtures/thinness.json';
import { darkness } from './raster.ts';
import { distanceTransform, otsuThreshold, thinnessMap, thresholdMask } from './thinness.ts';

// References come from scripts/gen-fixtures.py (NumPy brute force). Regenerate with `python3 scripts/gen-fixtures.py`.

describe('distanceTransform', () => {
  it.each(fixtures.edt.map((c) => [c.name, c] as const))('matches the brute-force EDT (%s)', (_, c) => {
    const result = distanceTransform({ width: c.width, height: c.height, data: Uint8Array.from(c.mask) });
    expect(result.width).toBe(c.width);
    c.distance.forEach((expected, i) => {
      expect(result.data[i]).toBeCloseTo(expected, 5);
    });
  });

  it('peaks at half the width on a stroke centreline', () => {
    const stroke = fixtures.edt.find((c) => c.name === 'stroke');
    if (!stroke) throw new Error('missing fixture');
    const result = distanceTransform({
      width: stroke.width,
      height: stroke.height,
      data: Uint8Array.from(stroke.mask),
    });
    // Rows 5–7 are a 3 px horizontal stroke: 1, 2, 1 across it, away from the vertical one.
    expect([5, 6, 7].map((y) => result.data[y * stroke.width + 3])).toEqual([1, 2, 1]);
  });
});

describe('otsuThreshold', () => {
  it('matches the exhaustive reference', () => {
    const data = Float32Array.from(fixtures.otsu.values);
    expect(otsuThreshold({ width: data.length, height: 1, data })).toBe(fixtures.otsu.threshold);
  });

  it('separates coloured curves from light grey grid lines and paper', () => {
    // Paper, a #d4d4d4 grid line and a #1f77b4 curve, by area roughly as in a chart crop.
    const grey = (v: number, n: number) => Array.from({ length: n }, () => [v, v, v]).flat();
    const rgb = Uint8Array.from([
      ...grey(255, 300),
      ...grey(212, 40),
      ...Array.from({ length: 40 }, () => [31, 119, 180]).flat(),
    ]);
    const dark = darkness({ width: 380, height: 1, channels: 3, data: rgb });
    const mask = thresholdMask(dark, otsuThreshold(dark));
    expect(Array.from(mask.data.slice(0, 340)).every((v) => v === 0)).toBe(true);
    expect(Array.from(mask.data.slice(340)).every((v) => v === 1)).toBe(true);
  });
});

describe('thinnessMap', () => {
  it('scores thin strokes above filled areas and finds no ink on blank paper', () => {
    const blob = fixtures.edt.find((c) => c.name === 'blob');
    if (!blob) throw new Error('missing fixture');
    const dark = Float32Array.from(blob.mask, (v) => (v ? 0.9 : 0.02));
    const map = thinnessMap({ width: blob.width, height: blob.height, data: dark });
    const centre = map.thinness.data[7 * blob.width + 8] ?? 0;
    const rim = map.thinness.data[7 * blob.width + 3] ?? 0;
    expect(centre).toBeLessThan(0.3);
    expect(rim).toBe(1);

    const paper = thinnessMap({ width: 8, height: 8, data: new Float32Array(64).fill(0.03) });
    expect(paper.mask.data.every((v) => v === 0)).toBe(true);
  });
});
