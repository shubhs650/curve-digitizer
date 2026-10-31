import type { Vec2 } from '@cd/core';
import type { XStepResult } from '@cd/trace';
import { create } from 'zustand';

// The X-step session (task 2.6) and its settings: UI state only. Nothing reaches the project until the user
// adds the points, which is one insertPoints command.

export interface XStepSession {
  readonly graphId: string;
  /** The click on the curve. */
  readonly start: Vec2;
  readonly running: boolean;
  readonly fraction: number;
  readonly result: XStepResult | null;
  readonly error: string | null;
}

export type XMode = 'step' | 'list';

/** What the user typed; kept as text so a half-typed number is not lost. Null From/To/Step = the graph default. */
export interface XSettings {
  readonly mode: XMode;
  readonly from: string | null;
  readonly to: string | null;
  readonly step: string | null;
  readonly list: string;
}

interface XStepState {
  readonly session: XStepSession | null;
  readonly settings: XSettings;
  readonly setSession: (update: (session: XStepSession | null) => XStepSession | null) => void;
  readonly setSettings: (patch: Partial<XSettings>) => void;
}

export const INITIAL_X_SETTINGS: XSettings = { mode: 'step', from: null, to: null, step: null, list: '' };

export const useXStepStore = create<XStepState>()((set) => ({
  session: null,
  settings: INITIAL_X_SETTINGS,
  setSession: (update) => {
    set((s) => ({ session: update(s.session) }));
  },
  setSettings: (patch) => {
    set((s) => ({ settings: { ...s.settings, ...patch } }));
  },
}));

export function useXStepSession(graphId: string): XStepSession | null {
  return useXStepStore((s) => (s.session?.graphId === graphId ? s.session : null));
}
