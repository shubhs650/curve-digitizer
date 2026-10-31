import type { Vec2 } from '@cd/core';
import { create } from 'zustand';

/**
 * A second image laid semi-transparently over a graph, to compare it with another crop or another edition of
 * the figure (task 3.6). A viewing aid: it is not part of the project and is gone after a reload (ADR 41).
 */
export interface Reference {
  /** File name, or the PDF page it was cropped from. */
  readonly name: string;
  readonly bitmap: ImageBitmap;
  /** 0 (invisible) to 1 (opaque). */
  readonly opacity: number;
  /** Where the reference's top-left corner sits, in graph image px. */
  readonly offsetPx: Vec2;
  readonly visible: boolean;
}

export type ReferencePatch = Partial<Pick<Reference, 'opacity' | 'offsetPx' | 'visible'>>;

/** Half see-through: both images stay readable where they overlap. */
export const DEFAULT_OPACITY = 0.5;

interface ReferenceState {
  readonly references: Readonly<Record<string, Reference>>;
  /** Shows `bitmap` over the graph, replacing (and freeing) any reference it had. */
  readonly setReference: (graphId: string, name: string, bitmap: ImageBitmap) => void;
  readonly updateReference: (graphId: string, patch: ReferencePatch) => void;
  readonly removeReference: (graphId: string) => void;
}

export const useReferenceStore = create<ReferenceState>()((set) => ({
  references: {},
  setReference: (graphId, name, bitmap) => {
    set((s) => {
      s.references[graphId]?.bitmap.close();
      return {
        references: {
          ...s.references,
          [graphId]: { name, bitmap, opacity: DEFAULT_OPACITY, offsetPx: [0, 0], visible: true },
        },
      };
    });
  },
  updateReference: (graphId, patch) => {
    set((s) => {
      const current = s.references[graphId];
      if (!current) return {};
      const opacity = patch.opacity === undefined ? current.opacity : Math.min(1, Math.max(0, patch.opacity));
      return { references: { ...s.references, [graphId]: { ...current, ...patch, opacity } } };
    });
  },
  removeReference: (graphId) => {
    set((s) => {
      const current = s.references[graphId];
      if (!current) return {};
      current.bitmap.close();
      return {
        references: Object.fromEntries(Object.entries(s.references).filter(([id]) => id !== graphId)),
      };
    });
  },
}));

/** The graph's reference, or null. */
export function useReference(graphId: string): Reference | null {
  return useReferenceStore((s) => s.references[graphId] ?? null);
}
