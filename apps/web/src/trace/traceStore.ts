import type { Vec2 } from '@cd/core';
import type { Rgb } from '@cd/image';
import type { PathNode, TraceBranch } from '@cd/trace';
import { create } from 'zustand';

// The guided-trace session (task 2.4): UI state only. Nothing reaches the project until the user adds the
// traced points, which is one insertPoints command.

export type TracePhase = 'end' | 'running' | 'branch' | 'done' | 'error';

export interface TraceSession {
  readonly graphId: string;
  readonly start: Vec2;
  /** Where the trace should stop; null traces to the curve's ends. */
  readonly end: Vec2 | null;
  /** end: waiting for the end click; branch: stopped at an ambiguity, waiting for the user's pick. */
  readonly phase: TracePhase;
  readonly fraction: number;
  /** The eyedropper colour, sampled at the start by the first run; continuations reuse it. */
  readonly color: Rgb | null;
  /** Every accepted centre so far, with its stroke width; continuations after a branch pick append. */
  readonly nodes: readonly PathNode[];
  /** At an ambiguity: where the tracer stopped and the candidate continuations. */
  readonly at: Vec2 | null;
  readonly branches: readonly TraceBranch[];
  readonly reachedEnd: boolean;
  readonly error: string | null;
}

/** Spacing of output points along the trace, px (the density setting); re-samples a finished trace live. */
export const DEFAULT_SPACING_PX = 5;

interface TraceState {
  readonly session: TraceSession | null;
  readonly spacingPx: number;
  readonly setSession: (update: (session: TraceSession | null) => TraceSession | null) => void;
  readonly setSpacing: (spacingPx: number) => void;
}

export const useTraceStore = create<TraceState>()((set) => ({
  session: null,
  spacingPx: DEFAULT_SPACING_PX,
  setSession: (update) => {
    set((s) => ({ session: update(s.session) }));
  },
  setSpacing: (spacingPx) => {
    set({ spacingPx });
  },
}));

/** The session when it belongs to `graphId`. */
export function useTraceSession(graphId: string): TraceSession | null {
  return useTraceStore((s) => (s.session?.graphId === graphId ? s.session : null));
}

/** Starts a session at a start click, waiting for the end click. */
export function pickStart(graphId: string, start: Vec2): void {
  useTraceStore.getState().setSession(() => ({
    graphId,
    start,
    end: null,
    phase: 'end',
    fraction: 0,
    color: null,
    nodes: [],
    at: null,
    branches: [],
    reachedEnd: false,
    error: null,
  }));
}
