import { describe, expect, it } from 'vitest';
import fixtures from '../../fixtures/filters.json';
import { deltaE, rgbToLab } from '../color.ts';
import { FILTER_OP_NAMES, FILTER_OPS, isFilterOpName, parseStep } from '../ops.ts';
import { canvas, rgbAt, stroke } from '../testing.ts';
import { FilterParamError, toRgba, type RgbaRaster } from './types.ts';

const noTick = () => undefined;

const pixels = (rgb: readonly (readonly [number, number, number])[]): RgbaRaster => ({
  width: rgb.length,
  height: 1,
  channels: 4,
  data: Uint8ClampedArray.from(rgb.flatMap(([r, g, b]) => [r, g, b, 255])),
});

const rgbList = (img: RgbaRaster) =>
  Array.from({ length: img.width * img.height }, (_, i) => [
    img.data[i * 4],
    img.data[i * 4 + 1],
    img.data[i * 4 + 2],
  ]);

describe('registry', () => {
  it('is the closed set from PRD §4.6', () => {
    expect(FILTER_OP_NAMES).toEqual([
      'brightness',
      'contrast',
      'grayscale',
      'invert',
      'threshold',
      'despeckle',
      'gridSuppress',
      'isolateColor',
    ]);
    expect(isFilterOpName('toString')).toBe(false);
    expect(isFilterOpName('invert')).toBe(true);
  });

  it('round-trips every op’s defaults through parse', () => {
    for (const name of FILTER_OP_NAMES) {
      const op = FILTER_OPS[name];
      expect(op.op).toBe(name);
      expect(op.parse(op.defaults as Record<string, unknown>)).toEqual(op.defaults);
    }
  });

  it('reports unknown ops and bad parameters instead of throwing', () => {
    expect(parseStep({ op: 'sharpen' })).toEqual({ ok: false, message: 'unknown filter "sharpen"' });
    expect(parseStep({ op: 'contrast', value: 'high' })).toEqual({
      ok: false,
      message: 'value must be a number',
    });
    expect(parseStep({ op: 'brightness', value: 2 })).toEqual({
      ok: false,
      message: 'value must be between -1 and 1',
    });
    expect(parseStep({ op: 'isolateColor', color: 'blue' })).toEqual({
      ok: false,
      message: 'color must be a #rrggbb colour',
    });
    expect(parseStep({ op: 'despeckle', radius: 2.4 })).toEqual({
      ok: true,
      step: { op: 'despeckle', params: { radius: 2 } },
    });
  });

  it('keeps alpha opaque and never modifies the input', () => {
    const src = pixels([
      [10, 20, 30],
      [200, 100, 50],
    ]);
    const copy = Uint8ClampedArray.from(src.data);
    for (const name of FILTER_OP_NAMES) {
      const op = FILTER_OPS[name];
      const out = op.apply(src, op.defaults as never, noTick);
      expect([out.width, out.height, out.channels]).toEqual([2, 1, 4]);
      expect([out.data[3], out.data[7]]).toEqual([255, 255]);
    }
    expect(src.data).toEqual(copy);
  });
});

describe('toRgba', () => {
  it('expands grey and RGB rasters', () => {
    expect(
      Array.from(toRgba({ width: 2, height: 1, channels: 1, data: Uint8Array.from([7, 9]) }).data),
    ).toEqual([7, 7, 7, 255, 9, 9, 9, 255]);
    expect(
      Array.from(toRgba({ width: 1, height: 1, channels: 3, data: Uint8Array.from([1, 2, 3]) }).data),
    ).toEqual([1, 2, 3, 255]);
  });
});

describe('tone filters', () => {
  it('brightness adds value × 255 and clamps', () => {
    const out = FILTER_OPS.brightness.apply(pixels([[10, 128, 250]]), { value: 0.1 }, noTick);
    expect(rgbList(out)).toEqual([[36, 154, 255]]);
  });

  it('contrast scales about mid-grey', () => {
    const out = FILTER_OPS.contrast.apply(pixels([[100, 127.5, 200]]), { value: 2, auto: false }, noTick);
    expect(rgbList(out)).toEqual([[72, 128, 255]]);
  });

  it('auto contrast stretches the occupied range to 0–255', () => {
    const faded = pixels(
      Array.from({ length: 200 }, (_, i): [number, number, number] =>
        i < 150 ? [200, 200, 200] : [120, 120, 120],
      ),
    );
    const out = FILTER_OPS.contrast.apply(faded, { value: 1, auto: true }, noTick);
    expect(rgbList(out)[0]).toEqual([255, 255, 255]);
    expect(rgbList(out)[199]).toEqual([0, 0, 0]);
  });

  it('auto contrast leaves a flat image alone', () => {
    const out = FILTER_OPS.contrast.apply(
      pixels([
        [90, 90, 90],
        [90, 90, 90],
      ]),
      { value: 1, auto: true },
      noTick,
    );
    expect(rgbList(out)).toEqual([
      [90, 90, 90],
      [90, 90, 90],
    ]);
  });

  it('grayscale writes Rec. 601 luma', () => {
    expect(rgbList(FILTER_OPS.grayscale.apply(pixels([[255, 0, 0]]), {}, noTick))).toEqual([[76, 76, 76]]);
  });

  it('invert flips every channel', () => {
    expect(rgbList(FILTER_OPS.invert.apply(pixels([[0, 100, 255]]), {}, noTick))).toEqual([[255, 155, 0]]);
  });

  it('threshold splits at a level or at Otsu', () => {
    const src = pixels([
      [250, 250, 250],
      [200, 200, 200],
      [30, 30, 30],
      [240, 240, 240],
    ]);
    expect(rgbList(FILTER_OPS.threshold.apply(src, { level: 0.1 }, noTick)).map((c) => c[0])).toEqual([
      255, 0, 0, 255,
    ]);
    expect(rgbList(FILTER_OPS.threshold.apply(src, { level: null }, noTick)).map((c) => c[0])).toEqual([
      255, 255, 0, 255,
    ]);
  });

  it('ticks once per row', () => {
    let rows = 0;
    FILTER_OPS.invert.apply(canvas(5, 7), {}, () => rows++);
    expect(rows).toBe(7);
  });
});

describe('despeckle', () => {
  it.each(fixtures.median.map((c) => [c.radius, c] as const))(
    'matches the brute-force median (radius %s)',
    (_, c) => {
      const grey = pixels(c.input.map((v) => [v, v, v] as const));
      const src = { ...grey, width: c.width, height: c.height };
      const out = FILTER_OPS.despeckle.apply(src, { radius: c.radius }, noTick);
      expect(rgbList(out).map((v) => v[0])).toEqual(c.output);
    },
  );

  it('filters colour channels independently', () => {
    const img = canvas(9, 9, [200, 50, 10]);
    img.data.set([0, 255, 255, 255], (4 * 9 + 4) * 4);
    const out = FILTER_OPS.despeckle.apply(img, { radius: 1 }, noTick);
    expect(rgbAt(out, 4, 4)).toEqual([200, 50, 10]);
  });

  it('removes a speck but keeps a 3 px stroke', () => {
    const img = canvas(40, 20);
    stroke(
      img,
      [
        [2, 10],
        [38, 10],
      ],
      3,
      [0, 0, 0],
    );
    img.data.set([0, 0, 0, 255], (3 * 40 + 20) * 4);
    const out = FILTER_OPS.despeckle.apply(img, { radius: 1 }, noTick);
    expect(rgbAt(out, 20, 3)).toEqual([255, 255, 255]);
    expect(rgbAt(out, 20, 9)[0]).toBeLessThan(10);
  });
});

describe('isolateColor', () => {
  it('whitens pixels outside the tolerance', () => {
    const src = pixels([
      [31, 119, 180],
      [40, 125, 185],
      [255, 127, 14],
      [0, 0, 0],
    ]);
    const out = FILTER_OPS.isolateColor.apply(src, { color: '#1f77b4', tolerance: 10 }, noTick);
    expect(rgbList(out)).toEqual([
      [31, 119, 180],
      [40, 125, 185],
      [255, 255, 255],
      [255, 255, 255],
    ]);
    expect(deltaE(rgbToLab(40, 125, 185), rgbToLab(31, 119, 180))).toBeLessThan(10);
  });
});

describe('gridSuppress', () => {
  it('paints grid lines with the paper colour and keeps the curve', () => {
    const paper: [number, number, number] = [240, 230, 200];
    const img = canvas(320, 240, paper);
    for (let y = 20; y < 240; y += 50)
      stroke(
        img,
        [
          [5, y],
          [315, y],
        ],
        1.5,
        [160, 160, 160],
      );
    for (let x = 20; x < 320; x += 50)
      stroke(
        img,
        [
          [x, 5],
          [x, 235],
        ],
        1.5,
        [160, 160, 160],
      );
    stroke(
      img,
      [
        [10, 200],
        [310, 30],
      ],
      3,
      [20, 20, 20],
    );
    const out = FILTER_OPS.gridSuppress.apply(img, { minRunPx: 150, tolerance: 2 }, noTick);
    expect(rgbAt(out, 200, 120)).toEqual(paper);
    expect(rgbAt(out, 45, 120)).toEqual(paper);
    // On the curve, between grid lines and where it crosses x = 170.
    const yAt = (x: number) => 200 - ((x - 10) * 170) / 300;
    expect(rgbAt(out, 100, yAt(100))[0]).toBeLessThan(60);
    expect(rgbAt(out, 170, yAt(170))[0]).toBeLessThan(60);
  });

  it('rejects silly parameters', () => {
    expect(() => FILTER_OPS.gridSuppress.parse({ minRunPx: 2 })).toThrow(FilterParamError);
  });
});
