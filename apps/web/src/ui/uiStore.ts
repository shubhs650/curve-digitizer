import { create } from 'zustand';

// UI-only state (CLAUDE.md: Zustand for UI state only). Anything that must survive a reload or be undoable
// belongs in the project, through ProjectStore.dispatch.

export interface UiState {
  readonly activeGraphId: string | null;
  readonly setActiveGraph: (graphId: string | null) => void;
}

export const useUiStore = create<UiState>()((set) => ({
  activeGraphId: null,
  setActiveGraph: (activeGraphId) => {
    set({ activeGraphId });
  },
}));
