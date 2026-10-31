import type { Vec2 } from '@cd/core';
import type { Rgb } from '@cd/image';
import type { MaskCurvesResult } from '@cd/workers';
import { create } from 'zustand';

// The colour-mask session (task 2.5): UI state only. Nothing reaches the project until the user adds the kept
// components' points, which is one insertPoints command.

export interface MaskSession {
  readonly graphId: string;
  /** The eyedropper click. */
  readonly pick: Vec2;
  /** The curve colour; null until the first run samples it at the pick. */
  readonly color: Rgb | null;
  /** ΔE*ab; null until the first run picks its default. */
  readonly tolerance: number | null;
  readonly running: boolean;
  readonly fraction: number;
  /** The latest result; an earlier one stays shown while a re-run (new tolerance) is in flight. */
  readonly result: MaskCurvesResult | null;
  /** Indices into `result.components` that the user keeps. */
  readonly kept: ReadonlySet<number>;
  readonly error: string | null;
}

interface MaskState {
  readonly session: MaskSession | null;
  readonly setSession: (update: (session: MaskSession | null) => MaskSession | null) => void;
}

export const useMaskStore = create<MaskState>()((set) => ({
  session: null,
  setSession: (update) => {
    set((s) => ({ session: update(s.session) }));
  },
}));

/** The session when it belongs to `graphId`. */
export function useMaskSession(graphId: string): MaskSession | null {
  return useMaskStore((s) => (s.session?.graphId === graphId ? s.session : null));
}

/** Keeps or drops one component. */
export function toggleKept(index: number): void {
  useMaskStore.getState().setSession((s) => {
    if (!s) return s;
    const kept = new Set(s.kept);
    if (kept.has(index)) kept.delete(index);
    else kept.add(index);
    return { ...s, kept };
  });
}
