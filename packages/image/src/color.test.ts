import { describe, expect, it } from 'vitest';
import fixtures from '../fixtures/filters.json';
import {
  colorDistance,
  deltaE,
  parseHexColor,
  pixelRgb,
  rgbToLab,
  sampleStrokeColor,
  toHexColor,
} from './color.ts';

// References come from scripts/gen-fixtures.py (NumPy). Regenerate with `python3 scripts/gen-fixtures.py`.

describe('rgbToLab', () => {
  it.each(fixtures.lab.rgb.map((rgb, i) => [rgb.join(','), rgb, fixtures.lab.lab[i]] as const))(
    'matches the NumPy reference for rgb(%s)',
    (_, rgb, expected) => {
      const lab = rgbToLab(rgb[0] ?? 0, rgb[1] ?? 0, rgb[2] ?? 0);
      expected?.forEach((v, k) => {
        expect(lab[k]).toBeCloseTo(v, 6);
      });
    },
  );

  it('puts white at L* = 100 and black at 0, both neutral', () => {
    const white = rgbToLab(255, 255, 255);
    expect(white[0]).toBeCloseTo(100, 3);
    expect(Math.abs(white[1]) + Math.abs(white[2])).toBeLessThan(0.01);
    expect(rgbToLab(0, 0, 0)).toEqual([0, 0, 0]);
  });
});

describe('deltaE', () => {
  it('is the Euclidean distance in CIELAB', () => {
    expect(deltaE([50, 10, -10], [53, 14, -10])).toBeCloseTo(5, 12);
    expect(deltaE(rgbToLab(31, 119, 180), rgbToLab(31, 119, 180))).toBe(0);
  });
});

describe('hex colours', () => {
  it('parses #rgb and #rrggbb and formats back', () => {
    expect(parseHexColor('#1F77b4')).toEqual([31, 119, 180]);
    expect(parseHexColor(' #fa0 ')).toEqual([255, 170, 0]);
    expect(parseHexColor('red')).toBeNull();
    expect(parseHexColor('#12345')).toBeNull();
    expect(toHexColor([31, 119, 180.4])).toBe('#1f77b4');
    expect(toHexColor([-3, 300, 0])).toBe('#00ff00');
  });
});

const raster = (w: number, h: number, fill: (x: number, y: number) => [number, number, number]) => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = fill(x, y);
      data.set([r, g, b, 255], (y * w + x) * 4);
    }
  }
  return { width: w, height: h, channels: 4 as const, data };
};

describe('sampleStrokeColor', () => {
  it('returns the stroke colour when the click lands on its anti-aliased edge', () => {
    // A 2 px blue stroke on rows 4–5 with a half-tone fringe on rows 3 and 6.
    const img = raster(12, 10, (_, y) =>
      y === 4 || y === 5 ? [31, 119, 180] : y === 3 || y === 6 ? [143, 187, 217] : [255, 255, 255],
    );
    const picked = sampleStrokeColor(img, 6.5, 3.5);
    expect(deltaE(rgbToLab(...picked), rgbToLab(31, 119, 180))).toBeLessThan(6);
    expect(pixelRgb(img, 6.5, 3.5)).toEqual([143, 187, 217]);
  });

  it('returns a bright stroke’s colour on a dark background', () => {
    const img = raster(12, 12, (_, y) => (y >= 5 && y <= 7 ? [76, 201, 240] : [30, 34, 39]));
    const picked = sampleStrokeColor(img, 6.5, 6.5);
    expect(deltaE(rgbToLab(...picked), rgbToLab(76, 201, 240))).toBeLessThan(3);
  });

  it('reads grey rasters', () => {
    const grey = { width: 2, height: 1, channels: 1 as const, data: Uint8Array.from([255, 255]) };
    expect(sampleStrokeColor(grey, 0, 0)).toEqual([255, 255, 255]);
  });
});

describe('colorDistance', () => {
  it('maps every pixel to its ΔE from the target and ticks once per row', () => {
    const img = raster(3, 2, (x) => (x === 1 ? [255, 0, 0] : [255, 255, 255]));
    let rows = 0;
    const d = colorDistance(img, [255, 0, 0], () => rows++);
    expect(rows).toBe(2);
    expect(d.data[1]).toBe(0);
    expect(d.data[0]).toBeCloseTo(deltaE(rgbToLab(255, 255, 255), rgbToLab(255, 0, 0)), 4);
  });
});
