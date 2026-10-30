import { migrate, type Project, serializeProject } from '@cd/core';
import {
  byModifiedDesc,
  pathSegments,
  PROJECT_FILE,
  type ProjectRepository,
  type ProjectSummary,
  summarize,
} from './repository';

/** Keeps projects in memory: for tests, and for browsers without OPFS (nothing survives a reload there). */
export class MemoryRepository implements ProjectRepository {
  readonly #projects = new Map<string, Map<string, Uint8Array>>();

  list(): Promise<readonly ProjectSummary[]> {
    const summaries: ProjectSummary[] = [];
    for (const id of this.#projects.keys()) {
      try {
        summaries.push(summarize(this.#read(id)));
      } catch {
        // Unreadable projects are skipped, as in OpfsRepository.
      }
    }
    return Promise.resolve(summaries.sort(byModifiedDesc));
  }

  loadProject(id: string): Promise<Project> {
    return Promise.resolve().then(() => this.#read(id));
  }

  saveProject(project: Project): Promise<void> {
    return this.writeFile(project.id, PROJECT_FILE, new TextEncoder().encode(serializeProject(project)));
  }

  writeFile(projectId: string, path: string, bytes: Uint8Array): Promise<void> {
    pathSegments(path);
    let files = this.#projects.get(projectId);
    if (!files) {
      files = new Map();
      this.#projects.set(projectId, files);
    }
    files.set(path, bytes.slice());
    return Promise.resolve();
  }

  readFile(projectId: string, path: string): Promise<Uint8Array> {
    const bytes = this.#projects.get(projectId)?.get(path);
    if (!bytes) return Promise.reject(new Error(`No file "${path}" in project "${projectId}"`));
    return Promise.resolve(bytes.slice());
  }

  deleteProject(id: string): Promise<void> {
    this.#projects.delete(id);
    return Promise.resolve();
  }

  #read(id: string): Project {
    const bytes = this.#projects.get(id)?.get(PROJECT_FILE);
    if (!bytes) throw new Error(`No project "${id}"`);
    return migrate(JSON.parse(new TextDecoder().decode(bytes)));
  }
}
