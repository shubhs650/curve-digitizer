import { describe, expect, it } from 'vitest';
import {
  actualSizeView,
  FIT_MARGIN,
  fitView,
  MAX_SCALE,
  MIN_SCALE,
  panBy,
  toImage,
  toScreen,
  wheelZoomFactor,
  ZOOM_STEP,
  zoomAt,
} from './viewTransform';

describe('view transform', () => {
  const view = { scale: 2, offset: [10, -4] } as const;

  it('maps image px to screen and back', () => {
    expect(toScreen(view, [0, 0])).toEqual([10, -4]);
    expect(toScreen(view, [0.5, 0.5])).toEqual([11, -3]);
    expect(toImage(view, toScreen(view, [123.25, 7.5]))).toEqual([123.25, 7.5]);
  });

  it('fits a large image inside the margins and centres it', () => {
    const fitted = fitView({ width: 2400, height: 1600 }, { width: 1232, height: 632 });
    expect(fitted.scale).toBeCloseTo((632 - 2 * FIT_MARGIN) / 1600);
    const [left, top] = toScreen(fitted, [0, 0]);
    const [right, bottom] = toScreen(fitted, [2400, 1600]);
    expect(top).toBeCloseTo(FIT_MARGIN);
    expect(bottom).toBeCloseTo(632 - FIT_MARGIN);
    expect(left + right).toBeCloseTo(1232);
  });

  it('does not magnify a small image when fitting', () => {
    expect(fitView({ width: 64, height: 48 }, { width: 800, height: 600 })).toEqual({
      scale: 1,
      offset: [368, 276],
    });
    expect(actualSizeView({ width: 2400, height: 1600 }, { width: 800, height: 600 })).toEqual({
      scale: 1,
      offset: [-800, -500],
    });
  });

  it('zooms about the anchor point', () => {
    const anchor = [300, 200] as const;
    const before = toImage(view, anchor);
    const zoomed = zoomAt(view, ZOOM_STEP, anchor);
    expect(zoomed.scale).toBeCloseTo(2 * ZOOM_STEP);
    const after = toImage(zoomed, anchor);
    expect(after[0]).toBeCloseTo(before[0]);
    expect(after[1]).toBeCloseTo(before[1]);
  });

  it('clamps the zoom range', () => {
    expect(zoomAt(view, 1e6, [0, 0]).scale).toBe(MAX_SCALE);
    expect(zoomAt(view, 1e-6, [0, 0]).scale).toBe(MIN_SCALE);
  });

  it('pans', () => {
    expect(panBy(view, [5, 6])).toEqual({ scale: 2, offset: [15, 2] });
  });

  it('turns wheel deltas into zoom factors', () => {
    expect(wheelZoomFactor(-100, 0)).toBeCloseTo(ZOOM_STEP);
    expect(wheelZoomFactor(100, 0)).toBeCloseTo(1 / ZOOM_STEP);
    expect(wheelZoomFactor(-3, 1)).toBeGreaterThan(1);
    expect(wheelZoomFactor(0, 0)).toBe(1);
  });
});
