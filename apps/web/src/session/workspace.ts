import { addGraph, addSource, createProject, type Graph, type Project, ProjectStore } from '@cd/core';
import { type ImageType, pngSize, sniffImageType } from '@cd/image';
import type { PageGeometry, PdfOpenOutput, PdfPermissions, RgbaImage } from '@cd/workers';
import type { ProjectRepository, ProjectSummary } from '../storage/repository';
import type { PdfBackend } from './pdf';

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
  readonly pdf: PdfBackend;
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

/** Where a source PDF of the open project stands in PDFium (the render worker). */
export type PdfDocState =
  | { readonly status: 'opening' }
  | { readonly status: 'open'; readonly pages: readonly PageGeometry[]; readonly permissions: PdfPermissions }
  /** Needs its password again (passwords are never stored); `wrong` after a failed attempt. */
  | { readonly status: 'locked'; readonly wrong: boolean }
  /** `unavailable`: PDFium could not be loaded, so the app works image-only (R5). */
  | { readonly status: 'failed'; readonly message: string; readonly unavailable: boolean };

export type PdfImportResult =
  | { readonly status: 'added'; readonly sourceId: string }
  /** The project already has this PDF (same SHA-256). */
  | { readonly status: 'existing'; readonly sourceId: string }
  | { readonly status: 'needsPassword'; readonly wrong: boolean }
  | { readonly status: 'failed'; readonly message: string; readonly unavailable: boolean };

export interface WorkspaceState {
  readonly projects: readonly ProjectSummary[];
  /** The open project, or null on the home screen. */
  readonly store: ProjectStore | null;
  /** Why the last save of the open project failed (e.g. storage full); cleared by the next successful save. */
  readonly saveError: string | null;
  /** The open project's source PDFs that have been opened in this session, by source id. */
  readonly pdf: Readonly<Record<string, PdfDocState>>;
}

/** Path of a source PDF inside its project (docs/PROJECT_SCHEMA.md). */
export function sourcePath(sourceId: string): string {
  return `sources/${sourceId}.pdf`;
}

function docState(result: PdfOpenOutput): PdfDocState {
  if (result.status === 'opened') {
    return { status: 'open', pages: result.pages, permissions: result.permissions };
  }
  switch (result.reason) {
    case 'passwordRequired':
      return { status: 'locked', wrong: false };
    case 'wrongPassword':
      return { status: 'locked', wrong: true };
    default:
      return {
        status: 'failed',
        message: result.message,
        unavailable: result.reason === 'pdfiumUnavailable',
      };
  }
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
  #state: WorkspaceState = { projects: [], store: null, saveError: null, pdf: {} };
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
    this.#closePdfs();
    this.#set({ store: null, pdf: {} });
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

  /**
   * Opens a PDF in PDFium and adds it to the open project as a source, creating a project named after it when
   * none is open. The file is streamed into the project's storage; PDFium reads it in the render worker.
   * Password and format problems come back as results; nothing is stored until the PDF has opened.
   */
  async importPdf(file: Blob & { readonly name: string }, password?: string): Promise<PdfImportResult> {
    const key = this.#deps.newId();
    const result = await this.#deps.pdf.open(key, file, password);
    if (result.status === 'failed') {
      if (result.reason === 'passwordRequired' || result.reason === 'wrongPassword') {
        return { status: 'needsPassword', wrong: result.reason === 'wrongPassword' };
      }
      return {
        status: 'failed',
        message: result.message,
        unavailable: result.reason === 'pdfiumUnavailable',
      };
    }

    const store = this.#state.store ?? (await this.createProject(baseName(file.name, UNTITLED_PROJECT)));
    const existing = store.project.sources.find((s) => s.sha256 === result.sha256);
    if (existing) {
      await this.#deps.pdf.close(key);
      if (this.#state.pdf[existing.id]?.status !== 'open') {
        this.#setPdf(existing.id, docState(await this.#deps.pdf.open(existing.id, file, password)));
      }
      return { status: 'existing', sourceId: existing.id };
    }
    try {
      await this.#deps.repo.writeBlob(store.project.id, sourcePath(key), file);
    } catch (error) {
      await this.#deps.pdf.close(key);
      throw error;
    }
    this.#setPdf(key, docState(result));
    store.dispatch(
      addSource({
        id: key,
        kind: 'pdf',
        fileName: file.name,
        sha256: result.sha256,
        pageCount: result.pages.length,
        // Bytes always stay in the project's storage; `embedded` only says whether a .cdz carries them.
        embedded: false,
      }),
    );
    await this.flush();
    await this.refreshProjects();
    return { status: 'added', sourceId: key };
  }

  /**
   * Opens a source PDF of the open project from storage, e.g. after the project was reopened. A protected PDF
   * comes back `locked` until called with its password.
   */
  async openSource(sourceId: string, password?: string): Promise<PdfDocState> {
    const store = this.#state.store;
    if (!store) throw new Error('No project is open');
    this.#setPdf(sourceId, { status: 'opening' });
    let state: PdfDocState;
    try {
      const file = await this.#deps.repo.readBlob(store.project.id, sourcePath(sourceId));
      state = docState(await this.#deps.pdf.open(sourceId, file, password));
    } catch (error) {
      state = {
        status: 'failed',
        message: error instanceof Error ? error.message : String(error),
        unavailable: false,
      };
    }
    // The project may have been closed or switched meanwhile.
    if (this.#state.store === store) this.#setPdf(sourceId, state);
    else if (state.status === 'open') void this.#deps.pdf.close(sourceId);
    return state;
  }

  /** A page of an open source PDF as displayed, its longer side `maxSide` pixels. */
  renderThumbnail(sourceId: string, pageIndex: number, maxSide: number): Promise<RgbaImage> {
    return this.#deps.pdf.thumbnail(sourceId, pageIndex, maxSide);
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
    this.#closePdfs();
    const store = new ProjectStore(project, { now: this.#deps.now });
    this.#unsubscribeStore = store.subscribe(({ project: changed }) => {
      this.#queueSave(changed);
    });
    this.#set({ store, pdf: {} });
    return store;
  }

  #setPdf(sourceId: string, state: PdfDocState): void {
    this.#set({ pdf: { ...this.#state.pdf, [sourceId]: state } });
  }

  #closePdfs(): void {
    for (const key of Object.keys(this.#state.pdf)) {
      this.#deps.pdf.close(key).catch(() => {
        // Closing only frees worker memory; a failure leaves nothing to undo.
      });
    }
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
