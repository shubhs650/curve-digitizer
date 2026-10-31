import {
  addGraph,
  addSource,
  type CdzContents,
  createProject,
  type Graph,
  type ImageRef,
  type PdfCropSource,
  type Project,
  ProjectStore,
  replaceGraphRender,
} from '@cd/core';
import { type ImageType, pngSize, sniffImageType } from '@cd/image';
import { capDpi } from '@cd/pdf/geometry';
import type { PageGeometry, PdfOpenOutput, PdfPermissions, RgbaImage } from '@cd/workers';
import { rescaleGraph } from '../pdf/rescale';
import type { ProjectRepository, ProjectSummary } from '../storage/repository';
import type { PdfBackend } from './pdf';

export interface EncodedPng {
  readonly png: Uint8Array;
  readonly width: number;
  readonly height: number;
}

/** Re-encodes a non-PNG image as PNG; the app passes a render-worker task. */
export type PngEncoder = (bytes: Uint8Array, type: Exclude<ImageType, 'png'>) => Promise<EncodedPng>;

/** Zips and unzips `.cdz` files; the app runs both in the compute worker. */
export interface CdzCodec {
  write(contents: CdzContents): Promise<Uint8Array>;
  /** @throws CdzFormatError or ProjectFormatError with a message for the user. */
  read(bytes: Uint8Array): Promise<CdzContents>;
}

/** Remembers which project was open, so a crashed or closed tab reopens it (R3). */
export interface SessionMarker {
  get(): string | null;
  set(projectId: string | null): void;
}

export interface WorkspaceDeps {
  readonly repo: ProjectRepository;
  readonly encodePng: PngEncoder;
  readonly pdf: PdfBackend;
  readonly cdz: CdzCodec;
  readonly session: SessionMarker;
  readonly newId: () => string;
  /** ISO 8601 clock. */
  readonly now: () => string;
  readonly appVersion: string;
}

export interface SavedCdz {
  readonly bytes: Uint8Array;
  readonly fileName: string;
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

/** A region of a source PDF page to render as a graph image (ADR 28). */
export interface CropRequest {
  /** 0-based. */
  readonly pageIndex: number;
  readonly rectPt: PdfCropSource['rectPt'];
  /** As asked for; capped to the pixel budget before rendering (R7). */
  readonly dpi: number;
  readonly rotation: PdfCropSource['rotation'];
}

export interface RenderResult {
  /** The DPI rendered at, after the cap. */
  readonly dpi: number;
  /** True when the asked-for DPI would have gone over the pixel budget (R7). */
  readonly capped: boolean;
  readonly renderMs: number;
}

/** Name of the performance measure each crop render records, read back by the P3 timing test. */
export const CROP_RENDER_MEASURE = 'pdf-crop-render';

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
    this.#deps.session.set(null);
    this.#unsubscribeStore?.();
    this.#unsubscribeStore = null;
    this.#closePdfs();
    this.#set({ store: null, pdf: {} });
    void this.flush().then(() => this.refreshProjects());
  }

  async deleteProject(id: string): Promise<void> {
    if (this.#state.store?.project.id === id) this.closeProject();
    if (this.#deps.session.get() === id) this.#deps.session.set(null);
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
      // A project opened from a .cdz without its PDFs gets the file back here (re-attached by SHA-256).
      const stored = await this.#deps.repo.readBlob(store.project.id, sourcePath(existing.id)).then(
        () => true,
        () => false,
      );
      if (!stored) await this.#deps.repo.writeBlob(store.project.id, sourcePath(existing.id), file);
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
    const file = await this.#deps.repo.readBlob(store.project.id, sourcePath(sourceId)).catch(() => null);
    if (file === null) {
      const name = store.project.sources.find((s) => s.id === sourceId)?.fileName ?? 'This PDF';
      state = {
        status: 'failed',
        message: `${name} is not stored with this project (it was saved without its PDFs). Open the PDF again to re-attach it.`,
        unavailable: false,
      };
      this.#setPdf(sourceId, state);
      return state;
    }
    try {
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

  /**
   * Renders a region of a page of an open source PDF and adds it to the project as a new Graph. The DPI is
   * capped to the pixel budget first (R7); the result says the DPI used.
   */
  async cropPdf(
    sourceId: string,
    request: CropRequest,
  ): Promise<RenderResult & { readonly graphId: string }> {
    const store = this.#requireStore();
    const source = store.project.sources.find((s) => s.id === sourceId);
    const graphId = this.#deps.newId();
    const { image, ...result } = await this.#renderCrop(sourceId, request, `graphs/${graphId}/original.png`);
    store.dispatch(
      addGraph({
        id: graphId,
        name: `${baseName(source?.fileName ?? '', 'PDF')} p${String(request.pageIndex + 1)}`,
        source: { kind: 'pdfCrop', sourceId, ...request, dpi: result.dpi },
        image,
        processing: [],
        calibration: null,
        datasets: [],
        fits: [],
        view: { zoom: 1, pan: [0, 0] },
      }),
    );
    return { graphId, ...result };
  }

  /**
   * Renders a PDF-crop graph's region again at another DPI ("Re-render at higher DPI"), rescaling every pixel
   * position by the DPI ratio, as one undoable step. The previous render stays in storage for the undo.
   */
  async rerenderGraph(graphId: string, dpi: number): Promise<RenderResult> {
    const store = this.#requireStore();
    const graph = store.project.graphs.find((g) => g.id === graphId);
    if (!graph) throw new Error(`No graph ${graphId}`);
    const { source } = graph;
    if (source.kind !== 'pdfCrop') throw new Error(`${graph.name} is not a PDF crop`);
    const target = capDpi(source.rectPt, dpi).dpi;
    if (target === source.dpi) throw new Error(`${graph.name} is already rendered at ${String(target)} DPI`);
    const { image, ...result } = await this.#renderCrop(
      source.sourceId,
      { ...source, dpi },
      `graphs/${graphId}/render-${String(target)}dpi.png`,
    );
    // The graph may have changed while the worker rendered; rescale what is there now.
    const current = store.project.graphs.find((g) => g.id === graphId) ?? graph;
    store.dispatch(
      replaceGraphRender(graphId, {
        source: { ...source, dpi: result.dpi },
        image,
        ...rescaleGraph(current, result.dpi / source.dpi),
      }),
    );
    return result;
  }

  async #renderCrop(
    sourceId: string,
    request: CropRequest,
    path: string,
  ): Promise<RenderResult & { readonly image: ImageRef }> {
    const store = this.#requireStore();
    const { png, width, height, ...result } = await this.renderCropPng(sourceId, request);
    await this.#deps.repo.writeFile(store.project.id, path, png);
    return { ...result, image: { path, width, height } };
  }

  /**
   * Renders a region of a page of an open source PDF as PNG without adding anything to the project, e.g. for a
   * reference overlay. The DPI is capped to the pixel budget (R7), as for a graph.
   */
  async renderCropPng(
    sourceId: string,
    request: CropRequest,
  ): Promise<RenderResult & { readonly png: Uint8Array; readonly width: number; readonly height: number }> {
    const state = this.#state.pdf[sourceId];
    if (state?.status !== 'open') throw new Error('The PDF is not open');
    if (!state.permissions.copy) {
      throw new Error("This PDF's permissions do not allow copying its content, so it cannot be cropped.");
    }
    const { dpi, capped } = capDpi(request.rectPt, request.dpi);
    const start = performance.now();
    const { png, width, height, renderMs } = await this.#deps.pdf.cropPng({ key: sourceId, ...request, dpi });
    performance.measure(CROP_RENDER_MEASURE, { start, duration: renderMs, detail: { width, height, dpi } });
    return { dpi, capped, renderMs, png, width, height };
  }

  /**
   * Reopens the project that was open when the app last ran (closed tab, crash, reload), if it is still on this
   * device (R3). Everything up to the last autosave is there; the undo history is not.
   */
  async restoreSession(): Promise<ProjectStore | null> {
    const id = this.#deps.session.get();
    if (id === null || this.#state.store) return this.#state.store;
    try {
      return await this.openProject(id);
    } catch {
      // Deleted elsewhere, or unreadable: start from the project list.
      this.#deps.session.set(null);
      return null;
    }
  }

  /**
   * The open project as a `.cdz` (PROJECT_SCHEMA "Container"): `project.json`, every graph's current image and,
   * with `embedSources`, the source PDFs. Unsaved changes are saved first.
   */
  async saveCdz({ embedSources }: { readonly embedSources: boolean }): Promise<SavedCdz> {
    const store = this.#requireStore();
    await this.flush();
    const project = store.project;
    const images = new Map<string, Uint8Array>();
    for (const graph of project.graphs) {
      images.set(graph.image.path, await this.#deps.repo.readFile(project.id, graph.image.path));
    }
    const sources = new Map<string, Uint8Array>();
    if (embedSources) {
      for (const source of project.sources) {
        sources.set(source.id, await this.#deps.repo.readFile(project.id, sourcePath(source.id)));
      }
    }
    const bytes = await this.#deps.cdz.write({
      project: {
        ...project,
        sources: project.sources.map((source) => ({ ...source, embedded: embedSources })),
      },
      images,
      sources,
    });
    return { bytes, fileName: project.name };
  }

  /**
   * Opens a `.cdz` as a project on this device. A project with the same id already here is kept, and the file
   * comes in as a copy with a new id, so opening a file never overwrites work.
   */
  async importCdz(file: InputFile): Promise<ProjectStore> {
    const { project: read, images, sources } = await this.#deps.cdz.read(file.bytes);
    const taken = (await this.#deps.repo.list()).some((p) => p.id === read.id);
    const project = taken ? { ...read, id: this.#deps.newId(), name: `${read.name} (copy)` } : read;
    for (const [path, bytes] of images) await this.#deps.repo.writeFile(project.id, path, bytes);
    for (const [id, bytes] of sources) await this.#deps.repo.writeFile(project.id, sourcePath(id), bytes);
    await this.#deps.repo.saveProject(project);
    const store = this.#attach(project);
    await this.refreshProjects();
    return store;
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

  #requireStore(): ProjectStore {
    const store = this.#state.store;
    if (!store) throw new Error('No project is open');
    return store;
  }

  #attach(project: Project): ProjectStore {
    this.#unsubscribeStore?.();
    this.#closePdfs();
    const store = new ProjectStore(project, { now: this.#deps.now });
    this.#deps.session.set(project.id);
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

  /**
   * Autosave (R3, ADR 31): a change is written as soon as no write is in flight; changes arriving during a write
   * collapse into one write of the latest state right after it. No debounce, so a reload or crash just after an
   * edit loses at most the write in flight.
   */
  #queueSave(project: Project): void {
    const idle = this.#pendingSave === null;
    this.#pendingSave = project;
    if (idle) this.#writeNow();
  }

  /** Chains a write of the latest pending state after the one in flight. */
  #writeNow(): void {
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
