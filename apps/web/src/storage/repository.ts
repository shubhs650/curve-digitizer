import type { Project } from '@cd/core';

/** What the home screen lists for a saved project. */
export interface ProjectSummary {
  readonly id: string;
  readonly name: string;
  /** ISO 8601. */
  readonly modified: string;
  readonly graphCount: number;
}

/**
 * Where projects live on this device (PRD §4.9): one folder per project holding `project.json` and the files it
 * references by relative path (`graphs/<id>/original.png`, `sources/<id>.pdf`), the same layout as a `.cdz`.
 */
export interface ProjectRepository {
  /** Saved projects, most recently modified first. Projects whose `project.json` cannot be read are skipped. */
  list(): Promise<readonly ProjectSummary[]>;
  /** @throws when the project does not exist or its `project.json` is not a valid project. */
  loadProject(id: string): Promise<Project>;
  saveProject(project: Project): Promise<void>;
  writeFile(projectId: string, path: string, bytes: Uint8Array): Promise<void>;
  /** @throws when the file does not exist. */
  readFile(projectId: string, path: string): Promise<Uint8Array>;
  deleteProject(id: string): Promise<void>;
}

export const PROJECT_FILE = 'project.json';

export function summarize(project: Project): ProjectSummary {
  return {
    id: project.id,
    name: project.name,
    modified: project.modified,
    graphCount: project.graphs.length,
  };
}

export function byModifiedDesc(a: ProjectSummary, b: ProjectSummary): number {
  return b.modified.localeCompare(a.modified);
}

/** Rejects absolute paths and `..` so a crafted project cannot reach outside its own folder. */
export function pathSegments(path: string): readonly string[] {
  const segments = path.split('/');
  if (segments.some((s) => s === '' || s === '.' || s === '..')) {
    throw new RangeError(`Invalid project file path "${path}"`);
  }
  return segments;
}
