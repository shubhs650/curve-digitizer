import { describe, expect, it } from 'vitest';
import { compact } from './render-samples.ts';

describe('compact', () => {
  it('drops an opaque alpha channel', () => {
    const rgba = {
      width: 2,
      height: 1,
      channels: 4 as const,
      data: Uint8Array.from([1, 2, 3, 255, 4, 5, 6, 255]),
    };
    expect(compact(rgba)).toEqual({
      width: 2,
      height: 1,
      channels: 3,
      data: Uint8Array.from([1, 2, 3, 4, 5, 6]),
    });
  });

  it('keeps alpha that is not opaque', () => {
    const rgba = { width: 1, height: 1, channels: 4 as const, data: Uint8Array.from([9, 9, 9, 128]) };
    expect(compact(rgba)).toBe(rgba);
  });

  it('collapses gray RGB to one channel', () => {
    const rgb = {
      width: 2,
      height: 1,
      channels: 3 as const,
      data: Uint8Array.from([7, 7, 7, 200, 200, 200]),
    };
    expect(compact(rgb)).toEqual({ width: 2, height: 1, channels: 1, data: Uint8Array.from([7, 200]) });
    const colour = { width: 1, height: 1, channels: 3 as const, data: Uint8Array.from([7, 8, 7]) };
    expect(compact(colour)).toBe(colour);
  });
});
