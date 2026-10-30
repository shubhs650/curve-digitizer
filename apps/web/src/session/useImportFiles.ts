import { useCallback } from 'react';
import { readInputFiles } from '../input/files';
import { useNotify } from '../ui/notices';
import { useUiStore } from '../ui/uiStore';
import { useWorkspace } from './context';

/** Imports files as Graphs, shows the last one and reports files that could not be opened. */
export function useImportFiles(): (files: File[]) => void {
  const workspace = useWorkspace();
  const notify = useNotify();
  const setActiveGraph = useUiStore((s) => s.setActiveGraph);

  return useCallback(
    (files: File[]) => {
      void (async () => {
        try {
          const { graphIds, failures } = await workspace.importImages(await readInputFiles(files));
          const last = graphIds.at(-1);
          if (last !== undefined) setActiveGraph(last);
          for (const failure of failures) {
            notify({ intent: 'error', title: `Could not open ${failure.fileName}`, body: failure.message });
          }
        } catch (error) {
          notify({
            intent: 'error',
            title: 'Could not open the file',
            body: error instanceof Error ? error.message : String(error),
          });
        }
      })();
    },
    [workspace, notify, setActiveGraph],
  );
}
