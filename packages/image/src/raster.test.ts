import { describe, expect, it } from 'vitest';
import { cropRaster, darkness, sampleBilinear } from './raster.ts';

describe('cropRaster', () => {
  const raster = {
    width: 4,
    height: 3,
    channels: 1 as const,
    data: Uint8Array.from({ length: 12 }, (_, i) => i),
  };

  it('copies a rectangle', () => {
    expect(cropRaster(raster, 1, 1, 2, 2)).toEqual({
      width: 2,
      height: 2,
      channels: 1,
      data: Uint8Array.from([5, 6, 9, 10]),
    });
  });

  it('clamps to the image', () => {
    const crop = cropRaster(raster, -2, 2, 10, 10);
    expect([crop.width, crop.height, Array.from(crop.data)]).toEqual([4, 1, [8, 9, 10, 11]]);
    expect(cropRaster(raster, 9, 9, 3, 3).width).toBe(0);
  });
});

describe('darkness', () => {
  it('is 1 − Rec. 601 luma, ignoring alpha', () => {
    const dark = darkness({
      width: 3,
      height: 1,
      channels: 4,
      data: Uint8Array.from([255, 255, 255, 0, 0, 0, 0, 255, 255, 0, 0, 255]),
    });
    expect(Array.from(dark.data).map((v) => Number(v.toFixed(4)))).toEqual([0, 1, 0.701]);
  });
});

describe('sampleBilinear', () => {
  it('interpolates between pixel centres and clamps outside', () => {
    const image = { width: 2, height: 1, data: Float32Array.from([0, 1]) };
    expect(sampleBilinear(image, 0.5, 0.5)).toBe(0);
    expect(sampleBilinear(image, 1, 0.5)).toBe(0.5);
    expect(sampleBilinear(image, 1.5, 0.2)).toBe(1);
    expect(sampleBilinear(image, -4, 3)).toBe(0);
  });
});
