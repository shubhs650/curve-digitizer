import { create } from 'zustand';

/** An error the user may report: what was thrown, and the title it was shown under, if any. */
export interface PendingReport {
  readonly error: unknown;
  readonly title?: string;
}

interface ReportState {
  /** `id` tells one report from the next, so the dialog starts afresh for each. */
  readonly pending: (PendingReport & { readonly id: number }) | null;
  /** Opens the report dialog for an error. Sends nothing: the dialog is where the user decides. */
  readonly open: (report: PendingReport) => void;
  readonly close: () => void;
}

export const useReportStore = create<ReportState>()((set) => ({
  pending: null,
  open: (pending) => {
    set((s) => ({ pending: { ...pending, id: (s.pending?.id ?? 0) + 1 } }));
  },
  close: () => {
    set({ pending: null });
  },
}));
