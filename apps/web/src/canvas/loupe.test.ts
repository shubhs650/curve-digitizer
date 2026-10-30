import { describe, expect, it } from 'vitest';
import { LOUPE_MIN_SCALE, LOUPE_SIZE, loupePosition, loupeView } from './Loupe';
import { toScreen } from './viewTransform';

describe('loupe', () => {
  it('centres the cursor image point and magnifies at least LOUPE_MIN_SCALE', () => {
    const view = loupeView([412.25, 1450.5], 0.4);
    expect(view.scale).toBe(LOUPE_MIN_SCALE);
    expect(toScreen(view, [412.25, 1450.5])).toEqual([LOUPE_SIZE / 2, LOUPE_SIZE / 2]);
    expect(loupeView([0, 0], 10).scale).toBe(20);
  });

  it('sits up and right of the cursor and flips at the edges', () => {
    const viewport = { width: 1000, height: 800 };
    expect(loupePosition([500, 400], viewport)).toEqual([524, 216]);
    expect(loupePosition([950, 400], viewport)).toEqual([950 - 24 - LOUPE_SIZE, 216]);
    expect(loupePosition([500, 50], viewport)).toEqual([524, 74]);
  });
});
