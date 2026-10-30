import type { Graph, Project } from '@cd/core';
import { createContext, type ReactNode, useContext, useSyncExternalStore } from 'react';
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
