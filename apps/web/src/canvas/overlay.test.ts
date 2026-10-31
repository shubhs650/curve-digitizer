import { describe, expect, it, vi } from 'vitest';
import { paintReference } from './overlay';

describe('paintReference', () => {
  it('draws the reference at its offset, scaled with the view, at its opacity', () => {
    const alphas: number[] = [];
    const ctx = {
      globalAlpha: 1,
      save: vi.fn(),
      restore: vi.fn(),
      drawImage: vi.fn(function (this: { globalAlpha: number }) {
        alphas.push(this.globalAlpha);
      }),
    };
    const bitmap = { width: 200, height: 100 } as ImageBitmap;
    paintReference(
      ctx as unknown as CanvasRenderingContext2D,
      { scale: 0.5, offset: [10, 20] },
      {
        bitmap,
        opacity: 0.3,
        offsetPx: [40, -60],
      },
    );
    expect(ctx.drawImage).toHaveBeenCalledWith(bitmap, 30, -10, 100, 50);
    expect(alphas).toEqual([0.3]);
    expect(ctx.restore).toHaveBeenCalledOnce();
  });
});
