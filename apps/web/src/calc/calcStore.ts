import { create } from 'zustand';

/** What the calculator tab shows, kept while the user switches tabs or graphs. UI state only. */
interface CalcState {
  /** The X values as typed. */
  readonly text: string;
  /** Dataset ids compared as A − B and A / B, or null when the comparison is off. */
  readonly compare: readonly [string, string] | null;
  readonly setText: (text: string) => void;
  readonly setCompare: (compare: readonly [string, string] | null) => void;
}

export const useCalcStore = create<CalcState>()((set) => ({
  text: '',
  compare: null,
  setText: (text) => {
    set({ text });
  },
  setCompare: (compare) => {
    set({ compare });
  },
}));
