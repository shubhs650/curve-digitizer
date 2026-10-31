import { FluentProvider, makeStyles, tokens } from '@fluentui/react-components';
import { useEffect, useState } from 'react';
import { useUndoShortcuts } from './history/useUndoShortcuts';
import { ShortcutSheet, useShortcutSheetKey } from './help/ShortcutSheet';
import { HomeScreen } from './home/HomeScreen';
import { Inspector } from './inspector/Inspector';
import { useImageInput } from './input/useImageInput';
import { CropPanel } from './pdf/CropPanel';
import { PasswordDialog } from './pdf/PasswordDialog';
import { PdfPageView } from './pdf/PdfPageView';
import { ProjectSidebar } from './project/ProjectSidebar';
import { ProjectEmpty } from './project/ProjectEmpty';
import { UpdatePrompt } from './pwa/UpdatePrompt';
import { ErrorBoundary } from './report/ErrorBoundary';
import { ErrorReportDialog } from './report/ErrorReportDialog';
import { useGlobalErrors } from './report/useGlobalErrors';
import { usePwaUpdate } from './pwa/usePwaUpdate';
import { useActiveGraph, useProject, useWorkspace, WorkspaceProvider } from './session/context';
import { createWorkspace } from './session/createWorkspace';
import { useImportFiles } from './session/useImportFiles';
import type { Workspace } from './session/workspace';
import { AppHeader } from './shell/AppHeader';
import { initialSidebarOpen } from './shell/layoutPrefs';
import { ShellLayout } from './shell/ShellLayout';
import { GraphEditor } from './tools/GraphEditor';
import { ToolRail } from './tools/ToolRail';
import { useToolShortcuts } from './tools/useToolShortcuts';
import { DataDock } from './table/DataTable';
import { DEFAULT_THEME, otherTheme, themes } from './theme';
import type { ThemeName } from './theme';
import { Notices, useNotify } from './ui/notices';
import { useUiStore } from './ui/uiStore';

// Layout lives on an inner element: FluentProvider copies its own className onto tooltip/dialog portal
// nodes, so a full-height style there would make every portal cover the page.
const useStyles = makeStyles({
  shell: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
  },
  dropHint: {
    position: 'fixed',
    inset: 0,
    zIndex: 1,
    pointerEvents: 'none',
    border: `${tokens.strokeWidthThickest} dashed ${tokens.colorBrandStroke1}`,
    backgroundColor: tokens.colorBrandBackground2,
    opacity: 0.6,
  },
});

export interface AppProps {
  /** Injected by tests; the app builds its own over OPFS. */
  readonly workspace?: Workspace;
}

export function App({ workspace: injected }: AppProps) {
  const [theme, setTheme] = useState<ThemeName>(DEFAULT_THEME);
  const [workspace] = useState(() => injected ?? createWorkspace());

  return (
    <FluentProvider theme={themes[theme]} data-theme={theme}>
      <WorkspaceProvider workspace={workspace}>
        <ErrorBoundary>
          <Shell
            theme={theme}
            onToggleTheme={() => {
              setTheme(otherTheme);
            }}
          />
        </ErrorBoundary>
        <ErrorReportDialog />
        <GlobalErrors />
        <Notices />
      </WorkspaceProvider>
    </FluentProvider>
  );
}

/** Outside the error boundary, so uncaught errors still reach the reporter after a crash. */
function GlobalErrors() {
  useGlobalErrors();
  return null;
}

function Shell({ theme, onToggleTheme }: { theme: ThemeName; onToggleTheme: () => void }) {
  const styles = useStyles();
  const [sidebarOpen, setSidebarOpen] = useState(() => initialSidebarOpen(window.innerWidth));
  const update = usePwaUpdate();
  const onFiles = useImportFiles();
  const dragging = useImageInput(onFiles);
  const project = useProject();
  const graph = useActiveGraph();
  const cropPage = useUiStore((s) => (project === null ? null : s.cropPage));
  useProjectList();
  useToolShortcuts();
  useUndoShortcuts();
  useShortcutSheetKey();

  return (
    <div className={styles.shell}>
      <AppHeader
        theme={theme}
        onToggleTheme={onToggleTheme}
        sidebarOpen={sidebarOpen}
        projectName={project?.name ?? null}
        onToggleSidebar={() => {
          setSidebarOpen((open) => !open);
        }}
      />
      <UpdatePrompt open={update.needRefresh} onReload={update.reload} onDismiss={update.dismiss} />
      <ShellLayout
        sidebarOpen={sidebarOpen}
        sidebar={project !== null && <ProjectSidebar onFiles={onFiles} />}
        rail={graph !== null && cropPage === null && <ToolRail />}
        inspector={
          cropPage !== null ? (
            <CropPanel page={cropPage} />
          ) : (
            graph !== null && <Inspector key={graph.id} graph={graph} />
          )
        }
        dock={graph !== null && cropPage === null && <DataDock />}
        canvas={
          project === null ? (
            <HomeScreen onFiles={onFiles} />
          ) : cropPage !== null ? (
            <PdfPageView key={`${cropPage.sourceId}/${String(cropPage.pageIndex)}`} page={cropPage} />
          ) : graph === null ? (
            <ProjectEmpty onFiles={onFiles} />
          ) : (
            <GraphEditor key={graph.id} graph={graph} />
          )
        }
      />
      <PasswordDialog />
      <ShortcutSheet />
      {dragging && <div className={styles.dropHint} aria-hidden="true" />}
    </div>
  );
}

/** Loads the saved-project list once at startup and reopens the project that was open last time (R3). */
function useProjectList(): void {
  const workspace = useWorkspace();
  const notify = useNotify();
  useEffect(() => {
    Promise.all([workspace.refreshProjects(), workspace.restoreSession()]).catch((error: unknown) => {
      notify({
        intent: 'error',
        title: 'Could not read saved projects',
        body: error instanceof Error ? error.message : String(error),
      });
    });
  }, [workspace, notify]);
}
