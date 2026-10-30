import { migrate, type Project, serializeProject } from '@cd/core';
import {
  byModifiedDesc,
  pathSegments,
  PROJECT_FILE,
  type ProjectRepository,
  type ProjectSummary,
  summarize,
} from './repository';

const PROJECTS_DIR = 'projects';

/** True when this browser offers the origin private file system with writable streams. */
export function hasOpfs(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    // Absent outside secure contexts and in some embedded browsers, whatever the DOM typings say.
    typeof (navigator.storage as StorageManager | undefined)?.getDirectory === 'function' &&
    typeof FileSystemFileHandle !== 'undefined' &&
    'createWritable' in FileSystemFileHandle.prototype
  );
}

/**
 * Projects in the origin private file system: `projects/<id>/project.json` plus its files. Writes go through
 * `createWritable`, which commits on close, so a crash mid-write leaves the previous file intact.
 */
export class OpfsRepository implements ProjectRepository {
  readonly #root: () => Promise<FileSystemDirectoryHandle>;

  constructor(root: () => Promise<FileSystemDirectoryHandle> = () => navigator.storage.getDirectory()) {
    this.#root = root;
  }

  async list(): Promise<readonly ProjectSummary[]> {
    const projects = await this.#projectsDir();
    const summaries: ProjectSummary[] = [];
    for await (const [name, handle] of projects.entries()) {
      if (handle.kind !== 'directory') continue;
      try {
        summaries.push(summarize(await this.loadProject(name)));
      } catch {
        // A folder without a readable project.json (an interrupted first save) is not a project.
      }
    }
    return summaries.sort(byModifiedDesc);
  }

  async loadProject(id: string): Promise<Project> {
    const text = new TextDecoder().decode(await this.readFile(id, PROJECT_FILE));
    return migrate(JSON.parse(text));
  }

  saveProject(project: Project): Promise<void> {
    return this.writeFile(project.id, PROJECT_FILE, new TextEncoder().encode(serializeProject(project)));
  }

  async writeFile(projectId: string, path: string, bytes: Uint8Array): Promise<void> {
    const file = await this.#fileHandle(projectId, path, true);
    const writable = await file.createWritable();
    try {
      await writable.write(bytes as Uint8Array<ArrayBuffer>);
      await writable.close();
    } catch (error) {
      await writable.abort();
      throw error;
    }
  }

  async readFile(projectId: string, path: string): Promise<Uint8Array> {
    const file = await (await this.#fileHandle(projectId, path, false)).getFile();
    return new Uint8Array(await file.arrayBuffer());
  }

  async deleteProject(id: string): Promise<void> {
    pathSegments(id);
    await (await this.#projectsDir()).removeEntry(id, { recursive: true });
  }

  async #projectsDir(): Promise<FileSystemDirectoryHandle> {
    return (await this.#root()).getDirectoryHandle(PROJECTS_DIR, { create: true });
  }

  async #fileHandle(projectId: string, path: string, create: boolean): Promise<FileSystemFileHandle> {
    const [fileName, ...dirs] = [...pathSegments(`${projectId}/${path}`)].reverse();
    let dir = await this.#projectsDir();
    for (const name of dirs.reverse()) dir = await dir.getDirectoryHandle(name, { create });
    // pathSegments never returns an empty list.
    return dir.getFileHandle(fileName as string, { create });
  }
}
