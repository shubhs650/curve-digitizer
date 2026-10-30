import type { RectPt, Rotation } from '@cd/core';
import { describe, expect, it } from 'vitest';
import {
  applyAffine,
  capDpi,
  composeAffine,
  cropPixelSize,
  displaySize,
  invertAffine,
  MAX_RENDER_PIXELS,
  pageToCrop,
  pageToDisplay,
  renderMatrix,
  type Affine,
} from './geometry.ts';

const ROTATIONS: readonly Rotation[] = [0, 90, 180, 270];

function expectPoint(m: Affine, from: readonly [number, number], to: readonly [number, number]): void {
  const [x, y] = applyAffine(m, from[0], from[1]);
  expect(x).toBeCloseTo(to[0], 9);
  expect(y).toBeCloseTo(to[1], 9);
}

describe('affine helpers', () => {
  it('composes in application order and inverts', () => {
    const scale: Affine = [2, 0, 0, 3, 0, 0];
    const shift: Affine = [1, 0, 0, 1, 5, -1];
    expectPoint(composeAffine(scale, shift), [1, 1], [7, 2]);
    expectPoint(composeAffine(shift, scale), [1, 1], [12, 0]);
    const m: Affine = [0.5, 1.5, -2, 0.25, 3, 4];
    expectPoint(composeAffine(m, invertAffine(m)), [7, -3], [7, -3]);
  });

  it('refuses a singular map', () => {
    expect(() => invertAffine([1, 2, 2, 4, 0, 0])).toThrow(RangeError);
  });
});

describe('pageToDisplay', () => {
  // A 100 × 50 pt page; the page-space corners bottom-left, top-left and bottom-right.
  const page = (rotation: Rotation) => ({ width: 100, height: 50, rotation });

  it.each([
    // [rotation, top-left (0,50) shows at, bottom-right (100,0) shows at]
    [0, [0, 0], [100, 50]],
    [90, [50, 0], [0, 100]],
    [180, [100, 50], [0, 0]],
    [270, [0, 100], [50, 0]],
  ] as const)('turns the page %i° clockwise', (rotation, topLeft, bottomRight) => {
    const m = pageToDisplay(page(rotation));
    expectPoint(m, [0, 50], topLeft);
    expectPoint(m, [100, 0], bottomRight);
  });

  it('swaps the displayed size for quarter turns', () => {
    expect(displaySize(page(0))).toEqual({ width: 100, height: 50 });
    expect(displaySize(page(270))).toEqual({ width: 50, height: 100 });
  });
});

describe('pageToCrop', () => {
  // 100 × 50 pt at 144 DPI: a 200 × 100 px image.
  const rect: RectPt = [10, 20, 110, 70];

  it.each([
    // [rotation, rect top-left lands at, rect bottom-right lands at]
    [0, [0, 0], [200, 100]],
    [90, [100, 0], [0, 200]],
    [180, [200, 100], [0, 0]],
    [270, [0, 200], [100, 0]],
  ] as const)('maps the rectangle onto the crop turned %i° clockwise', (rotation, topLeft, bottomRight) => {
    const m = pageToCrop(rect, 144, rotation);
    expectPoint(m, [10, 70], topLeft);
    expectPoint(m, [110, 20], bottomRight);
  });

  it('rejects empty rectangles and bad DPI', () => {
    expect(() => pageToCrop([10, 20, 10, 70], 144, 0)).toThrow(RangeError);
    expect(() => pageToCrop(rect, 0, 0)).toThrow(RangeError);
    expect(() => pageToCrop(rect, Number.NaN, 0)).toThrow(RangeError);
  });
});

describe('renderMatrix', () => {
  it.each(ROTATIONS)('takes display space to crop pixels on a page with /Rotate %i', (pageRotation) => {
    const page = { width: 612, height: 792, rotation: pageRotation };
    const rect: RectPt = [72, 100, 300, 400];
    for (const rotation of ROTATIONS) {
      const m = renderMatrix(page, rect, 300, rotation);
      const expected = pageToCrop(rect, 300, rotation);
      for (const [u, v] of [
        [72, 100],
        [300, 400],
        [150, 250],
      ] as const) {
        const [dx, dy] = applyAffine(pageToDisplay(page), u, v);
        expectPoint(m, [dx, dy], applyAffine(expected, u, v));
      }
    }
  });
});

describe('cropPixelSize', () => {
  it('rounds each side at the DPI and swaps for quarter turns', () => {
    expect(cropPixelSize([0, 0, 720, 480], 240, 0)).toEqual({ width: 2400, height: 1600 });
    expect(cropPixelSize([0, 0, 720, 480], 240, 90)).toEqual({ width: 1600, height: 2400 });
    expect(cropPixelSize([0, 0, 10.1, 10.3], 72, 180)).toEqual({ width: 10, height: 10 });
    expect(cropPixelSize([0, 0, 0.1, 0.1], 72, 0)).toEqual({ width: 1, height: 1 });
  });
});

describe('capDpi (R7)', () => {
  const pixels = (rect: RectPt, dpi: number) => {
    const { width, height } = cropPixelSize(rect, dpi, 0);
    return width * height;
  };

  it('keeps a DPI whose crop fits the budget', () => {
    const a4: RectPt = [0, 0, 842, 595];
    expect(pixels(a4, 600)).toBeLessThanOrEqual(MAX_RENDER_PIXELS);
    expect(capDpi(a4, 600)).toEqual({ dpi: 600, capped: false });
  });

  it('caps to the largest whole DPI within 50 Mpx', () => {
    const a3: RectPt = [0, 0, 1190, 842];
    expect(pixels(a3, 600)).toBeGreaterThan(MAX_RENDER_PIXELS);
    const { dpi, capped } = capDpi(a3, 600);
    expect(capped).toBe(true);
    expect(dpi).toBe(508);
    expect(pixels(a3, dpi)).toBeLessThanOrEqual(MAX_RENDER_PIXELS);
    expect(pixels(a3, dpi + 1)).toBeGreaterThan(MAX_RENDER_PIXELS);
  });

  it('honours a custom budget', () => {
    expect(capDpi([0, 0, 72, 72], 300, 10_000)).toEqual({ dpi: 100, capped: true });
  });
});
