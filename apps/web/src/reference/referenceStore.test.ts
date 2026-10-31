import { afterEach, describe, expect, it, type Mock, vi } from 'vitest';
import { DEFAULT_OPACITY, useReferenceStore } from './referenceStore';

const bitmap = () => ({ width: 40, height: 30, close: vi.fn() }) as unknown as ImageBitmap;
const closeOf = (b: ImageBitmap) => (b as unknown as { readonly close: Mock }).close;

afterEach(() => {
  useReferenceStore.setState({ references: {} });
});

describe('referenceStore', () => {
  it('shows a new reference half see-through at the top-left corner', () => {
    const b = bitmap();
    useReferenceStore.getState().setReference('g1', 'other.png', b);
    expect(useReferenceStore.getState().references.g1).toEqual({
      name: 'other.png',
      bitmap: b,
      opacity: DEFAULT_OPACITY,
      offsetPx: [0, 0],
      visible: true,
    });
  });

  it('frees the bitmap it replaces or removes, and leaves other graphs alone', () => {
    const [first, second, other] = [bitmap(), bitmap(), bitmap()];
    const { setReference, removeReference } = useReferenceStore.getState();
    setReference('g1', 'a.png', first);
    setReference('g2', 'b.png', other);
    setReference('g1', 'c.png', second);
    expect(closeOf(first)).toHaveBeenCalledOnce();
    removeReference('g1');
    expect(closeOf(second)).toHaveBeenCalledOnce();
    expect(Object.keys(useReferenceStore.getState().references)).toEqual(['g2']);
    expect(closeOf(other)).not.toHaveBeenCalled();
    removeReference('g1');
  });

  it('moves, fades and hides it, keeping the opacity within 0…1', () => {
    const { setReference, updateReference } = useReferenceStore.getState();
    setReference('g1', 'a.png', bitmap());
    updateReference('g1', { offsetPx: [12, -5], opacity: 1.4 });
    expect(useReferenceStore.getState().references.g1).toMatchObject({ offsetPx: [12, -5], opacity: 1 });
    updateReference('g1', { opacity: -0.2, visible: false });
    expect(useReferenceStore.getState().references.g1).toMatchObject({ opacity: 0, visible: false });
    updateReference('missing', { opacity: 0.3 });
    expect(useReferenceStore.getState().references.missing).toBeUndefined();
  });
});
