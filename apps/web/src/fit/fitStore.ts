import type { FitResult, ModelSpec, Recommendation } from '@cd/fit';
import { useMemo } from 'react';
import { create } from 'zustand';

// The fit panel's session (task 3.2): UI state only. A fit reaches the project when the user accepts it, as one
// setDatasetFit command.

export interface FitSession {
  readonly graphId: string;
  readonly datasetId: string;
  readonly running: boolean;
  readonly fraction: number;
  /** Candidates from auto-recommend or a single chosen model; null before the first run. */
  readonly result: Recommendation | null;
  /** What produced `result`: undefined for auto-recommend. */
  readonly spec: ModelSpec | undefined;
  readonly error: string | null;
  /** The candidate being previewed on the canvas and in the residual plot. */
  readonly previewIndex: number;
}

interface FitState {
  readonly session: FitSession | null;
  readonly setSession: (update: (session: FitSession | null) => FitSession | null) => void;
}

export const useFitStore = create<FitState>()((set) => ({
  session: null,
  setSession: (update) => {
    set((s) => ({ session: update(s.session) }));
  },
}));

export function useFitSession(graphId: string, datasetId: string | undefined): FitSession | null {
  return useFitStore((s) =>
    s.session?.graphId === graphId && s.session.datasetId === datasetId ? s.session : null,
  );
}

/** The candidate previewed for a graph, for the canvas overlay. */
export function usePreviewFit(
  graphId: string,
): { readonly datasetId: string; readonly fit: FitResult } | null {
  const session = useFitStore((s) => s.session);
  // Derived outside the selector: a fresh object from the selector would re-render forever.
  return useMemo(() => {
    if (session?.graphId !== graphId || session.result === null) return null;
    const fit = session.result.fits[session.previewIndex];
    return fit === undefined ? null : { datasetId: session.datasetId, fit };
  }, [session, graphId]);
}
