import { create } from 'zustand';

// UI-only state (CLAUDE.md: Zustand for UI state only). Anything that must survive a reload or be undoable
// belongs in the project, through ProjectStore.dispatch.

/** Canvas tools on the tool rail; later tasks add calibrate and point. */
export type ToolId = 'select' | 'pan';

export interface UiState {
  readonly activeGraphId: string | null;
  /** The dataset new points go into; per graph, so switching graphs keeps each graph's choice. */
  readonly activeDatasetIds: Readonly<Record<string, string>>;
  readonly tool: ToolId;
  readonly loupe: boolean;
  readonly setActiveGraph: (graphId: string | null) => void;
  readonly setActiveDataset: (graphId: string, datasetId: string) => void;
  readonly setTool: (tool: ToolId) => void;
  readonly toggleLoupe: () => void;
}

export const useUiStore = create<UiState>()((set) => ({
  activeGraphId: null,
  activeDatasetIds: {},
  tool: 'select',
  loupe: true,
  setActiveGraph: (activeGraphId) => {
    set({ activeGraphId });
  },
  setActiveDataset: (graphId, datasetId) => {
    set((s) => ({ activeDatasetIds: { ...s.activeDatasetIds, [graphId]: datasetId } }));
  },
  setTool: (tool) => {
    set({ tool });
  },
  toggleLoupe: () => {
    set((s) => ({ loupe: !s.loupe }));
  },
}));
