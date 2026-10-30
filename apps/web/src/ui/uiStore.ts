import { create } from 'zustand';

// UI-only state (CLAUDE.md: Zustand for UI state only). Anything that must survive a reload or be undoable
// belongs in the project, through ProjectStore.dispatch.

/** Canvas tools on the tool rail; later tasks add calibrate and point. */
export type ToolId = 'select' | 'pan';

export interface UiState {
  readonly activeGraphId: string | null;
  readonly tool: ToolId;
  readonly loupe: boolean;
  readonly setActiveGraph: (graphId: string | null) => void;
  readonly setTool: (tool: ToolId) => void;
  readonly toggleLoupe: () => void;
}

export const useUiStore = create<UiState>()((set) => ({
  activeGraphId: null,
  tool: 'select',
  loupe: true,
  setActiveGraph: (activeGraphId) => {
    set({ activeGraphId });
  },
  setTool: (tool) => {
    set({ tool });
  },
  toggleLoupe: () => {
    set((s) => ({ loupe: !s.loupe }));
  },
}));
