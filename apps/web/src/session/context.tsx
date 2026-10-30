import type { Command, Dataset, Graph, Project } from '@cd/core';
import { createContext, type ReactNode, useCallback, useContext, useSyncExternalStore } from 'react';
import { useNotify } from '../ui/notices';
import { useUiStore } from '../ui/uiStore';
import type { Workspace, WorkspaceState } from './workspace';

const WorkspaceContext = createContext<Workspace | null>(null);

export function WorkspaceProvider({ workspace, children }: { workspace: Workspace; children: ReactNode }) {
  return <WorkspaceContext.Provider value={workspace}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): Workspace {
  const workspace = useContext(WorkspaceContext);
  if (!workspace) throw new Error('useWorkspace needs a WorkspaceProvider');
  return workspace;
}

export function useWorkspaceState(): WorkspaceState {
  const workspace = useWorkspace();
  return useSyncExternalStore(
    (listener) => workspace.subscribe(listener),
    () => workspace.state,
  );
}

const noSubscription = () => () => undefined;

/** The open project, re-rendering on every change; null on the home screen. */
export function useProject(): Project | null {
  const { store } = useWorkspaceState();
  return useSyncExternalStore(
    store ? (listener) => store.subscribe(listener) : noSubscription,
    () => store?.project ?? null,
  );
}

/** The graph shown on the canvas: the one picked in the sidebar, else the first. */
export function useActiveGraph(): Graph | null {
  const project = useProject();
  const activeGraphId = useUiStore((s) => s.activeGraphId);
  if (!project) return null;
  return project.graphs.find((g) => g.id === activeGraphId) ?? project.graphs[0] ?? null;
}

/** The dataset new points go into: the one picked in the inspector, else the graph's first. */
export function useActiveDataset(graph: Graph | null): Dataset | null {
  const picked = useUiStore((s) => (graph ? s.activeDatasetIds[graph.id] : undefined));
  if (!graph) return null;
  return graph.datasets.find((d) => d.id === picked) ?? graph.datasets[0] ?? null;
}

/**
 * Dispatches a command to the open project. A command that no longer applies (its target was deleted
 * meanwhile) is reported instead of thrown into React.
 */
export function useDispatch(): (command: Command) => boolean {
  const { store } = useWorkspaceState();
  const notify = useNotify();
  return useCallback(
    (command: Command) => {
      if (!store) return false;
      try {
        store.dispatch(command);
        return true;
      } catch (error) {
        notify({
          intent: 'error',
          title: `Could not ${command.label.toLowerCase()}`,
          body: error instanceof Error ? error.message : String(error),
        });
        return false;
      }
    },
    [store, notify],
  );
}
