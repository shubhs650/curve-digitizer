import type { Raster } from '@cd/image';
import { describe, expect, it } from 'vitest';
import { snapToCurve, type Vec2 } from './snap.ts';

type Rgb = readonly [number, number, number];
const BLUE: Rgb = [31, 119, 180];
const GRID: Rgb = [212, 212, 212];

interface Stroke {
  /** Distance from a point to the stroke's centreline. */
  readonly distance: (x: number, y: number) => number;
  readonly width: number;
  readonly colour: Rgb;
}

/** Renders strokes on white with 8 × 8 supersampled anti-aliasing (pixel centres at i + 0.5, ADR 25). */
function render(width: number, height: number, strokes: readonly Stroke[]): Raster {
  const data = new Uint8Array(width * height * 3).fill(255);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (const stroke of strokes) {
        let covered = 0;
        for (let sy = 0; sy < 8; sy++) {
          for (let sx = 0; sx < 8; sx++) {
            if (stroke.distance(x + (sx + 0.5) / 8, y + (sy + 0.5) / 8) <= stroke.width / 2) covered++;
          }
        }
        const a = covered / 64;
        for (let c = 0; c < 3; c++) {
          const i = (y * width + x) * 3 + c;
          data[i] = Math.round((data[i] ?? 255) * (1 - a) + (stroke.colour[c] ?? 0) * a);
        }
      }
    }
  }
  return { width, height, channels: 3, data };
}

/** A line through `through` at `degrees` from the x axis. */
function line(through: Vec2, degrees: number, width = 3, colour = BLUE): Stroke {
  const t = (degrees * Math.PI) / 180;
  const n: Vec2 = [-Math.sin(t), Math.cos(t)];
  return { distance: (x, y) => Math.abs((x - through[0]) * n[0] + (y - through[1]) * n[1]), width, colour };
}

describe('snapToCurve', () => {
  it('moves a click onto a horizontal stroke centreline to a fraction of a pixel', () => {
    const image = render(60, 40, [line([0, 20.3], 0)]);
    const snapped = snapToCurve(image, [30.2, 17.1], 8);
    expect(snapped).not.toBeNull();
    expect(Math.abs((snapped?.px[1] ?? 0) - 20.3)).toBeLessThan(0.1);
    expect(Math.abs((snapped?.px[0] ?? 0) - 30.2)).toBeLessThanOrEqual(1);
    expect(snapped?.lineWidthPx).toBeGreaterThan(2.4);
    expect(snapped?.lineWidthPx).toBeLessThan(3.6);
  });

  it.each([17, 33, 45, 70])('lands on a %i° stroke', (degrees) => {
    const stroke = line([30.4, 25.7], degrees);
    const image = render(60, 50, [stroke]);
    // 3 px off the line, along its normal.
    const t = (degrees * Math.PI) / 180;
    const click: Vec2 = [30.4 + 4 * Math.cos(t) - 3 * Math.sin(t), 25.7 + 4 * Math.sin(t) + 3 * Math.cos(t)];
    const snapped = snapToCurve(image, click, 8);
    expect(snapped).not.toBeNull();
    expect(stroke.distance(...(snapped?.px ?? [0, 0]))).toBeLessThan(0.15);
  });

  it('picks the nearer of two strokes', () => {
    const image = render(60, 60, [line([0, 20.5], 0), line([0, 31.5], 0, 3, [255, 127, 14])]);
    expect(snapToCurve(image, [30, 23.5], 8)?.px[1]).toBeCloseTo(20.5, 1);
    expect(snapToCurve(image, [30, 28.5], 8)?.px[1]).toBeCloseTo(31.5, 1);
  });

  it('ignores light grey grid lines next to the curve', () => {
    const image = render(60, 40, [line([30.5, 0], 90, 1, GRID), line([0, 20.3], 0)]);
    const snapped = snapToCurve(image, [31, 15], 8);
    expect(Math.abs((snapped?.px[1] ?? 0) - 20.3)).toBeLessThan(0.15);
  });

  it('leaves clicks with no stroke in reach, or only a filled area, unsnapped', () => {
    expect(snapToCurve(render(60, 40, [line([0, 20.3], 0)]), [30, 8], 8)).toBeNull();
    const bar: Stroke = { distance: (x) => Math.abs(x - 30), width: 24, colour: BLUE };
    expect(snapToCurve(render(80, 40, [bar]), [30, 20], 8)).toBeNull();
    expect(snapToCurve(render(20, 20, []), [10, 10], 8)).toBeNull();
  });

  it('works on a window of the image placed at `origin`', () => {
    const image = render(60, 40, [line([0, 20.3], 0)]);
    const whole = snapToCurve(image, [30.2, 17.1], 8);
    const snapped = snapToCurve(image, [130.2, 217.1], 8, [100, 200]);
    expect(snapped?.px[0]).toBeCloseTo((whole?.px[0] ?? 0) + 100, 9);
    expect(snapped?.px[1]).toBeCloseTo((whole?.px[1] ?? 0) + 200, 9);
  });

  it('snaps near the image edge without reading outside it', () => {
    const image = render(30, 30, [line([0, 2.5], 0)]);
    expect(snapToCurve(image, [1, 5], 8)?.px[1]).toBeCloseTo(2.5, 1);
  });
});
