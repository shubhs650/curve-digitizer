import { useCallback } from 'react';
import { isCdzFile, isPdfFile, readInputFiles } from '../input/files';
import { usePdfActions } from '../pdf/usePdfActions';
import { useNotify } from '../ui/notices';
import { useUiStore } from '../ui/uiStore';
import { useWorkspace } from './context';

/**
 * Opens `.cdz` projects, adds PDFs as sources and images as Graphs, shows the last new Graph and reports files
 * that could not be opened. PDFs go one at a time, since each may ask for a password.
 */
export function useImportFiles(): (files: File[]) => void {
  const workspace = useWorkspace();
  const notify = useNotify();
  const setActiveGraph = useUiStore((s) => s.setActiveGraph);
  const { importPdf } = usePdfActions();

  return useCallback(
    (files: File[]) => {
      void (async () => {
        for (const cdz of files.filter(isCdzFile)) {
          try {
            const [input] = await readInputFiles([cdz]);
            if (!input) continue;
            const store = await workspace.importCdz(input);
            setActiveGraph(store.project.graphs[0]?.id ?? null);
          } catch (error) {
            notify({
              intent: 'error',
              title: `Could not open ${cdz.name}`,
              body: error instanceof Error ? error.message : String(error),
            });
          }
        }
        const images = files.filter((file) => !isPdfFile(file) && !isCdzFile(file));
        for (const pdf of files.filter(isPdfFile)) await importPdf(pdf);
        if (images.length === 0) return;
        try {
          const { graphIds, failures } = await workspace.importImages(await readInputFiles(images));
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
    [workspace, notify, setActiveGraph, importPdf],
  );
}
