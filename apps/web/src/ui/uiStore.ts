import { create } from 'zustand';

// UI-only state (CLAUDE.md: Zustand for UI state only). Anything that must survive a reload or be undoable
// belongs in the project, through ProjectStore.dispatch.

/** Canvas tools on the tool rail. */
export type ToolId = 'select' | 'point' | 'pan' | 'calibrate';

const NO_POINTS: ReadonlySet<string> = new Set();

export interface UiState {
  readonly activeGraphId: string | null;
  /** The dataset new points go into; per graph, so switching graphs keeps each graph's choice. */
  readonly activeDatasetIds: Readonly<Record<string, string>>;
  readonly tool: ToolId;
  readonly loupe: boolean;
  /** Magnetic snap for placed points (PRD §4.4); the radius is a project setting. */
  readonly snap: boolean;
  /** Selected points of the active graph, as overlay keys `${datasetId}/${pointId}`. */
  readonly selection: ReadonlySet<string>;
  readonly setActiveGraph: (graphId: string | null) => void;
  readonly setActiveDataset: (graphId: string, datasetId: string) => void;
  readonly setTool: (tool: ToolId) => void;
  readonly toggleLoupe: () => void;
  readonly toggleSnap: () => void;
  readonly setSelection: (selection: ReadonlySet<string>) => void;
}

export const useUiStore = create<UiState>()((set) => ({
  activeGraphId: null,
  activeDatasetIds: {},
  tool: 'select',
  loupe: true,
  snap: true,
  selection: NO_POINTS,
  setActiveGraph: (activeGraphId) => {
    set((s) => (s.activeGraphId === activeGraphId ? s : { activeGraphId, selection: NO_POINTS }));
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
  toggleSnap: () => {
    set((s) => ({ snap: !s.snap }));
  },
  setSelection: (selection) => {
    set({ selection });
  },
}));
