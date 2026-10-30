import { addGraph, createProject, type Graph, type Project, ProjectStore } from '@cd/core';
import { type ImageType, pngSize, sniffImageType } from '@cd/image';
import type { ProjectRepository, ProjectSummary } from '../storage/repository';

export interface EncodedPng {
  readonly png: Uint8Array;
  readonly width: number;
  readonly height: number;
}

/** Re-encodes a non-PNG image as PNG; the app passes a render-worker task. */
export type PngEncoder = (bytes: Uint8Array, type: Exclude<ImageType, 'png'>) => Promise<EncodedPng>;

export interface WorkspaceDeps {
  readonly repo: ProjectRepository;
  readonly encodePng: PngEncoder;
  readonly newId: () => string;
  /** ISO 8601 clock. */
  readonly now: () => string;
  readonly appVersion: string;
}

/** A file handed to the app by the picker, a drop, a paste or the OS file handler. */
export interface InputFile {
  readonly name: string;
  readonly bytes: Uint8Array;
}

export interface ImportFailure {
  readonly fileName: string;
  readonly message: string;
}

export interface ImportResult {
  readonly graphIds: readonly string[];
  readonly failures: readonly ImportFailure[];
}

export interface WorkspaceState {
  readonly projects: readonly ProjectSummary[];
  /** The open project, or null on the home screen. */
  readonly store: ProjectStore | null;
  /** Why the last save of the open project failed (e.g. storage full); cleared by the next successful save. */
  readonly saveError: string | null;
}

export const UNTITLED_PROJECT = 'Untitled project';

/** "pump-curve.final.png" → "pump-curve.final"; falls back when nothing is left. */
export function baseName(fileName: string, fallback: string): string {
  const name = fileName
    .replace(/^.*[\\/]/, '')
    .replace(/\.[^.]*$/, '')
    .trim();
  return name === '' ? fallback : name;
}

/**
 * The projects on this device and the one that is open. Owns persistence: every change to the open project is
 * saved, one write at a time, the latest state winning.
 */
export class Workspace {
  readonly #deps: WorkspaceDeps;
  readonly #listeners = new Set<() => void>();
  #state: WorkspaceState = { projects: [], store: null, saveError: null };
  #unsubscribeStore: (() => void) | null = null;
  #saving: Promise<void> = Promise.resolve();
  #pendingSave: Project | null = null;

  constructor(deps: WorkspaceDeps) {
    this.#deps = deps;
  }

  get state(): WorkspaceState {
    return this.#state;
  }

  get repo(): ProjectRepository {
    return this.#deps.repo;
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  async refreshProjects(): Promise<void> {
    this.#set({ projects: await this.#deps.repo.list() });
  }

  async createProject(name: string = UNTITLED_PROJECT): Promise<ProjectStore> {
    const project = createProject({
      id: this.#deps.newId(),
      name,
      appVersion: this.#deps.appVersion,
      now: this.#deps.now(),
    });
    await this.#deps.repo.saveProject(project);
    const store = this.#attach(project);
    await this.refreshProjects();
    return store;
  }

  async openProject(id: string): Promise<ProjectStore> {
    const project = await this.#deps.repo.loadProject(id);
    return this.#attach(project);
  }

  closeProject(): void {
    this.#unsubscribeStore?.();
    this.#unsubscribeStore = null;
    this.#set({ store: null });
    void this.flush().then(() => this.refreshProjects());
  }

  async deleteProject(id: string): Promise<void> {
    if (this.#state.store?.project.id === id) this.closeProject();
    await this.flush();
    await this.#deps.repo.deleteProject(id);
    await this.refreshProjects();
  }

  /**
   * Adds each image as a new Graph of the open project, creating a project named after the first image when
   * none is open. Files that are not PNG, JPEG or WebP are reported, not thrown.
   */
  async importImages(files: readonly InputFile[]): Promise<ImportResult> {
    const graphIds: string[] = [];
    const failures: ImportFailure[] = [];
    const accepted = files.filter((file) => {
      if (sniffImageType(file.bytes) !== null) return true;
      failures.push({ fileName: file.name, message: 'Not a PNG, JPEG or WebP image.' });
      return false;
    });
    if (accepted.length === 0) return { graphIds, failures };

    const store =
      this.#state.store ?? (await this.createProject(baseName(accepted[0]?.name ?? '', UNTITLED_PROJECT)));
    for (const file of accepted) {
      try {
        const graph = await this.#importImage(store.project.id, file);
        store.dispatch(addGraph(graph));
        graphIds.push(graph.id);
      } catch (error) {
        failures.push({
          fileName: file.name,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
    await this.flush();
    await this.refreshProjects();
    return { graphIds, failures };
  }

  /** Bytes of a file of the open project, e.g. a graph's `image.path`. */
  readFile(path: string): Promise<Uint8Array> {
    const store = this.#state.store;
    if (!store) return Promise.reject(new Error('No project is open'));
    return this.#deps.repo.readFile(store.project.id, path);
  }

  /** Resolves once every change made so far is on disk. */
  async flush(): Promise<void> {
    while (this.#pendingSave !== null) await this.#saving;
    await this.#saving;
  }

  async #importImage(projectId: string, file: InputFile): Promise<Graph> {
    const type = sniffImageType(file.bytes);
    if (type === null) throw new Error('Not a PNG, JPEG or WebP image.');
    // A PNG is stored byte for byte; anything else is decoded once and stored losslessly as PNG.
    const { png, width, height } =
      type === 'png'
        ? { png: file.bytes, ...pngSize(file.bytes) }
        : await this.#deps.encodePng(file.bytes, type);
    const id = this.#deps.newId();
    const path = `graphs/${id}/original.png`;
    await this.#deps.repo.writeFile(projectId, path, png);
    return {
      id,
      name: baseName(file.name, 'Graph'),
      source: { kind: 'image', fileName: file.name },
      image: { path, width, height },
      processing: [],
      calibration: null,
      datasets: [],
      fits: [],
      view: { zoom: 1, pan: [0, 0] },
    };
  }

  #attach(project: Project): ProjectStore {
    this.#unsubscribeStore?.();
    const store = new ProjectStore(project, { now: this.#deps.now });
    this.#unsubscribeStore = store.subscribe(({ project: changed }) => {
      this.#queueSave(changed);
    });
    this.#set({ store });
    return store;
  }

  #queueSave(project: Project): void {
    const idle = this.#pendingSave === null;
    this.#pendingSave = project;
    if (!idle) return;
    this.#saving = this.#saving
      .then(async () => {
        const latest = this.#pendingSave;
        this.#pendingSave = null;
        if (latest) await this.#deps.repo.saveProject(latest);
        if (this.#state.saveError !== null) this.#set({ saveError: null });
      })
      .catch((error: unknown) => {
        this.#set({ saveError: error instanceof Error ? error.message : String(error) });
      });
  }

  #set(patch: Partial<WorkspaceState>): void {
    this.#state = { ...this.#state, ...patch };
    for (const listener of this.#listeners) listener();
  }
}
