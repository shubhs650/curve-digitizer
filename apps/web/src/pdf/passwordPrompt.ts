import { create } from 'zustand';

/** A protected PDF waiting for its password. `submit` resolves once the attempt is handled. */
export interface PasswordRequest {
  readonly fileName: string;
  /** The last password was wrong. */
  readonly wrong: boolean;
  readonly submit: (password: string) => Promise<void>;
  /** The user gave up on this PDF. */
  readonly cancel: () => void;
}

interface PasswordPromptState {
  readonly request: PasswordRequest | null;
  /** Counts requests, so each attempt can start with an empty field. */
  readonly attempt: number;
  readonly ask: (request: PasswordRequest) => void;
  readonly dismiss: () => void;
}

/** UI state for the one password dialog (passwords themselves are never stored, ARCHITECTURE §12). */
export const usePasswordPrompt = create<PasswordPromptState>()((set) => ({
  request: null,
  attempt: 0,
  ask: (request) => {
    set((s) => ({ request, attempt: s.attempt + 1 }));
  },
  dismiss: () => {
    set({ request: null });
  },
}));
