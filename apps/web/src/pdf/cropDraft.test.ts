import { describe, expect, it } from 'vitest';
import {
  cropRotation,
  HANDLES,
  moveRect,
  rectFromDisplay,
  rectToDisplayFractions,
  resizeRect,
  turn,
  wholePage,
} from './cropDraft';

const A4 = { width: 595, height: 842, rotation: 0 } as const;
const LANDSCAPE = { ...A4, rotation: 90 } as const;

describe('crop geometry', () => {
  it('turns in quarter turns either way', () => {
    expect(turn(0, 1)).toBe(90);
    expect(turn(270, 1)).toBe(0);
    expect(turn(0, -1)).toBe(270);
    expect(cropRotation(LANDSCAPE, 90)).toBe(180);
    expect(cropRotation(A4, 0)).toBe(0);
  });

  it('maps a dragged display rectangle to page space, either corner first, clamped to the page', () => {
    // Display y runs down from the top; page y runs up from the bottom.
    expect(rectFromDisplay(A4, [72, 100], [300, 20])).toEqual([72, 742, 300, 822]);
    expect(rectFromDisplay(A4, [-10, 800], [700, 900])).toEqual([0, 0, 595, 42]);
    expect(rectFromDisplay(A4, [10, 10], [11, 200])).toBeNull();
  });

  it('accounts for /Rotate: a page turned 90° shows its left edge at the top', () => {
    // pageToDisplay for 90°: (u, v) ↦ (v, u).
    expect(rectFromDisplay(LANDSCAPE, [100, 50], [200, 150])).toEqual([50, 100, 150, 200]);
  });

  it('round-trips through display fractions', () => {
    for (const page of [
      A4,
      LANDSCAPE,
      { ...A4, rotation: 180 } as const,
      { ...A4, rotation: 270 } as const,
    ]) {
      const rect = [72, 100, 300, 400] as const;
      const f = rectToDisplayFractions(page, rect);
      const size = page.rotation % 180 === 0 ? [595, 842] : [842, 595];
      const back = rectFromDisplay(
        page,
        [f.left * (size[0] ?? 0), f.top * (size[1] ?? 0)],
        [(f.left + f.width) * (size[0] ?? 0), (f.top + f.height) * (size[1] ?? 0)],
      );
      back?.forEach((v, i) => {
        expect(v).toBeCloseTo(rect[i] ?? NaN, 9);
      });
    }
    expect(rectToDisplayFractions(A4, wholePage(A4))).toEqual({ left: 0, top: 0, width: 1, height: 1 });
  });
});

describe('crop rectangle editing', () => {
  const page = { width: 600, height: 800 };
  const rect = { left: 100, top: 100, right: 300, bottom: 200 };

  it('moves the rectangle, keeping it on the page', () => {
    expect(moveRect(rect, [50, 20], page)).toEqual({ left: 150, top: 120, right: 350, bottom: 220 });
    expect(moveRect(rect, [-500, 1000], page)).toEqual({ left: 0, top: 700, right: 200, bottom: 800 });
  });

  it('resizes from a corner or an edge, clamped to the page', () => {
    expect(resizeRect(rect, 'se', [10, 30], page)).toEqual({ left: 100, top: 100, right: 310, bottom: 230 });
    expect(resizeRect(rect, 'n', [99, -150], page)).toEqual({ left: 100, top: 0, right: 300, bottom: 200 });
    expect(resizeRect(rect, 'w', [-20, 5], page)).toEqual({ left: 80, top: 100, right: 300, bottom: 200 });
  });

  it('flips instead of turning inside out when a handle passes the opposite edge', () => {
    expect(resizeRect(rect, 'e', [-250, 0], page)).toEqual({ left: 50, top: 100, right: 100, bottom: 200 });
  });

  it('lists all eight handles', () => {
    expect([...HANDLES].sort()).toEqual(['e', 'n', 'ne', 'nw', 's', 'se', 'sw', 'w']);
  });
});
