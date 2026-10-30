import { useCallback } from 'react';
import { useWorkspace } from '../session/context';
import type { Notice } from '../ui/notices';
import { useNotify } from '../ui/notices';
import { usePasswordPrompt } from './passwordPrompt';

/** R5: what the user sees when PDFium cannot be loaded. Images keep working. */
export const PDF_UNAVAILABLE: Notice = {
  intent: 'error',
  title: 'PDF support could not be loaded',
  body: 'You can still digitize from an image: open a PNG, JPEG or WebP of the graph, such as a screenshot of the page.',
};

export interface PdfActions {
  /** Adds a PDF to the project, asking for its password as long as needed; resolves when done or cancelled. */
  readonly importPdf: (file: File) => Promise<void>;
  /** Asks for the password of a stored, protected source PDF and opens it. */
  readonly unlockSource: (sourceId: string, fileName: string) => void;
}

export function usePdfActions(): PdfActions {
  const workspace = useWorkspace();
  const notify = useNotify();
  const ask = usePasswordPrompt((s) => s.ask);
  const dismiss = usePasswordPrompt((s) => s.dismiss);

  const importPdf = useCallback(
    (file: File) =>
      new Promise<void>((resolve) => {
        const fail = (body: string) => {
          notify({ intent: 'error', title: `Could not open ${file.name}`, body });
        };
        const attempt = async (password?: string): Promise<void> => {
          try {
            const result = await workspace.importPdf(file, password);
            if (result.status === 'needsPassword') {
              ask({ fileName: file.name, wrong: result.wrong, submit: attempt, cancel: resolve });
              return;
            }
            dismiss();
            if (result.status === 'failed') {
              if (result.unavailable) notify(PDF_UNAVAILABLE);
              else fail(result.message);
            }
          } catch (error) {
            dismiss();
            fail(error instanceof Error ? error.message : String(error));
          }
          resolve();
        };
        void attempt();
      }),
    [workspace, notify, ask, dismiss],
  );

  const unlockSource = useCallback(
    (sourceId: string, fileName: string) => {
      const attempt = async (password: string): Promise<void> => {
        const state = await workspace.openSource(sourceId, password);
        if (state.status === 'locked') {
          ask({ fileName, wrong: true, submit: attempt, cancel: () => undefined });
          return;
        }
        dismiss();
        if (state.status === 'failed' && state.unavailable) notify(PDF_UNAVAILABLE);
      };
      ask({ fileName, wrong: false, submit: attempt, cancel: () => undefined });
    },
    [workspace, notify, ask, dismiss],
  );

  return { importPdf, unlockSource };
}
