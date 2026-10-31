import { addDataset, renameProject } from '@cd/core';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRepository } from '../storage/memory';
import type { ProjectRepository } from '../storage/repository';
import { FAKE_PASSWORD, FakePdfBackend, LOCKED_PDF, NO_COPY_PDF, pdfFile, PLAIN_PDF } from '../test/fakePdf';
import { inProcessCdz, memorySession } from '../test/session';
import { baseName, type PngEncoder, sourcePath, Workspace } from './workspace';

/** Signature + IHDR of a 3 × 2 PNG; enough for the workspace, which stores PNG bytes as they are. */
const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 3, 0, 0, 0, 2,
  8, 2, 0, 0, 0,
]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

function setup(repo: ProjectRepository = new MemoryRepository(), session = memorySession()) {
  let id = 0;
  let tick = 0;
  const encodePng = vi.fn<PngEncoder>(() => Promise.resolve({ png: PNG, width: 3, height: 2 }));
  const pdf = new FakePdfBackend();
  const workspace = new Workspace({
    repo,
    encodePng,
    pdf,
    cdz: inProcessCdz,
    session,
    newId: () => `id${String(++id)}`,
    now: () => new Date(Date.UTC(2026, 10, 1, 0, 0, tick++)).toISOString(),
    appVersion: '0.0.0-test',
  });
  return { workspace, repo, encodePng, pdf, session };
}

describe('baseName', () => {
  it('strips folders and the last extension', () => {
    expect(baseName('C:\\charts\\pump.curve.png', 'x')).toBe('pump.curve');
    expect(baseName('a/b/fig 3.jpeg', 'x')).toBe('fig 3');
    expect(baseName('.png', 'fallback')).toBe('fallback');
  });
});

describe('Workspace', () => {
  it('creates a project named after the first image and adds one graph per image', async () => {
    const { workspace, repo } = setup();
    const result = await workspace.importImages([
      { name: 'pump-curve.png', bytes: PNG },
      { name: 'second.png', bytes: PNG },
    ]);
    expect(result.failures).toEqual([]);
    const project = workspace.state.store?.project;
    expect(project?.name).toBe('pump-curve');
    expect(project?.graphs.map((g) => g.name)).toEqual(['pump-curve', 'second']);
    expect(project?.graphs[0]).toMatchObject({
      id: result.graphIds[0],
      source: { kind: 'image', fileName: 'pump-curve.png' },
      image: { path: `graphs/${String(result.graphIds[0])}/original.png`, width: 3, height: 2 },
      calibration: null,
      datasets: [],
    });
    // Stored byte for byte, and the saved project.json matches the open project.
    const graph = project?.graphs[0];
    expect(await repo.readFile(project?.id ?? '', graph?.image.path ?? '')).toEqual(PNG);
    expect(await repo.loadProject(project?.id ?? '')).toEqual(workspace.state.store?.project);
    expect(workspace.state.projects).toEqual([
      { id: project?.id, name: 'pump-curve', modified: project?.modified, graphCount: 2 },
    ]);
  });

  it('re-encodes JPEG and WebP through the encoder', async () => {
    const { workspace, encodePng, repo } = setup();
    const { graphIds } = await workspace.importImages([{ name: 'scan.jpg', bytes: JPEG }]);
    expect(encodePng).toHaveBeenCalledWith(JPEG, 'jpeg');
    const project = workspace.state.store?.project;
    expect(await repo.readFile(project?.id ?? '', `graphs/${String(graphIds[0])}/original.png`)).toEqual(PNG);
  });

  it('adds to the open project and undoes the import', async () => {
    const { workspace } = setup();
    const store = await workspace.createProject('Fatigue');
    await workspace.importImages([{ name: 'a.png', bytes: PNG }]);
    expect(store.project.name).toBe('Fatigue');
    expect(store.project.graphs).toHaveLength(1);
    expect(store.undoLabel).toBe('Add graph');
    store.undo();
    expect(store.project.graphs).toHaveLength(0);
  });

  it('reports files that are not images without creating a project', async () => {
    const { workspace } = setup();
    const result = await workspace.importImages([
      { name: 'notes.txt', bytes: new TextEncoder().encode('hi') },
    ]);
    expect(result).toEqual({
      graphIds: [],
      failures: [{ fileName: 'notes.txt', message: 'Not a PNG, JPEG or WebP image.' }],
    });
    expect(workspace.state.store).toBeNull();
  });

  it('reports an image that fails to decode and keeps the others', async () => {
    const { workspace, encodePng } = setup();
    encodePng.mockRejectedValueOnce(new Error('decode failed'));
    const result = await workspace.importImages([
      { name: 'bad.jpg', bytes: JPEG },
      { name: 'good.png', bytes: PNG },
    ]);
    expect(result.failures).toEqual([{ fileName: 'bad.jpg', message: 'decode failed' }]);
    expect(workspace.state.store?.project.graphs.map((g) => g.name)).toEqual(['good']);
  });

  it('saves every change and lists, reopens and deletes projects', async () => {
    const { workspace, repo } = setup();
    const store = await workspace.createProject('One');
    store.dispatch(renameProject('Renamed'));
    await workspace.flush();
    expect((await repo.loadProject(store.project.id)).name).toBe('Renamed');

    workspace.closeProject();
    expect(workspace.state.store).toBeNull();
    await workspace.createProject('Two');
    await workspace.flush();
    await workspace.refreshProjects();
    expect(workspace.state.projects.map((p) => p.name)).toEqual(['Two', 'Renamed']);

    const reopened = await workspace.openProject(store.project.id);
    expect(reopened.project).toEqual(store.project);
    expect(reopened.canUndo).toBe(false);

    await workspace.deleteProject(store.project.id);
    expect(workspace.state.store).toBeNull();
    expect(workspace.state.projects.map((p) => p.name)).toEqual(['Two']);
  });

  it('keeps only the latest state when changes arrive during a save', async () => {
    const repo = new MemoryRepository();
    const save = vi.spyOn(repo, 'saveProject');
    const { workspace } = setup(repo);
    const store = await workspace.createProject('v0');
    save.mockClear();
    for (const name of ['v1', 'v2', 'v3', 'v4']) store.dispatch(renameProject(name));
    await workspace.flush();
    expect((await repo.loadProject(store.project.id)).name).toBe('v4');
    expect(save.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it('surfaces a failed save and clears it after the next success', async () => {
    const repo = new MemoryRepository();
    const { workspace } = setup(repo);
    const store = await workspace.createProject();
    vi.spyOn(repo, 'saveProject').mockRejectedValueOnce(new Error('QuotaExceededError'));
    store.dispatch(renameProject('a'));
    await workspace.flush();
    expect(workspace.state.saveError).toBe('QuotaExceededError');
    store.dispatch(renameProject('b'));
    await workspace.flush();
    expect(workspace.state.saveError).toBeNull();
  });

  it('notifies subscribers', async () => {
    const { workspace } = setup();
    const listener = vi.fn();
    const unsubscribe = workspace.subscribe(listener);
    await workspace.createProject();
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });
});

describe('Workspace PDFs', () => {
  it('adds a PDF as a source of a new project named after it and keeps its bytes in storage', async () => {
    const { workspace, repo, pdf } = setup();
    const result = await workspace.importPdf(pdfFile(PLAIN_PDF, 'ASME VIII.pdf'));
    expect(result).toEqual({ status: 'added', sourceId: 'id1' });
    const project = workspace.state.store?.project;
    expect(project?.name).toBe('ASME VIII');
    expect(project?.sources).toEqual([
      {
        id: 'id1',
        kind: 'pdf',
        fileName: 'ASME VIII.pdf',
        sha256: expect.any(String) as string,
        pageCount: 2,
        embedded: false,
      },
    ]);
    expect(await repo.readFile(project?.id ?? '', sourcePath('id1'))).toEqual(PLAIN_PDF);
    expect(await repo.loadProject(project?.id ?? '')).toEqual(project);
    expect(workspace.state.pdf['id1']).toMatchObject({ status: 'open', permissions: { copy: true } });
    expect(pdf.open_.has('id1')).toBe(true);
  });

  it('asks for a password and stores nothing until the PDF opens (R6)', async () => {
    const { workspace } = setup();
    const file = pdfFile(LOCKED_PDF);
    expect(await workspace.importPdf(file)).toEqual({ status: 'needsPassword', wrong: false });
    expect(workspace.state.store).toBeNull();
    expect(await workspace.importPdf(file, 'guess')).toEqual({ status: 'needsPassword', wrong: true });
    expect(await workspace.importPdf(file, FAKE_PASSWORD)).toMatchObject({ status: 'added' });
    expect(workspace.state.store?.project.sources).toHaveLength(1);
  });

  it('reports a file that is not a PDF, and PDFium failing to load, without creating a project (R5)', async () => {
    const { workspace, pdf } = setup();
    expect(await workspace.importPdf(pdfFile(PNG, 'x.pdf'))).toEqual({
      status: 'failed',
      message: 'Not a PDF.',
      unavailable: false,
    });
    pdf.unavailable = true;
    expect(await workspace.importPdf(pdfFile(PLAIN_PDF))).toMatchObject({
      status: 'failed',
      unavailable: true,
    });
    expect(workspace.state.store).toBeNull();
  });

  it('keeps one source per PDF content', async () => {
    const { workspace, pdf } = setup();
    await workspace.importPdf(pdfFile(PLAIN_PDF));
    expect(await workspace.importPdf(pdfFile(PLAIN_PDF, 'copy.pdf'))).toEqual({
      status: 'existing',
      sourceId: 'id1',
    });
    expect(workspace.state.store?.project.sources).toHaveLength(1);
    expect([...pdf.open_]).toEqual(['id1']);
  });

  it('records the no-copy permission (R6)', async () => {
    const { workspace } = setup();
    const { sourceId } = (await workspace.importPdf(pdfFile(NO_COPY_PDF))) as { sourceId: string };
    expect(workspace.state.pdf[sourceId]).toMatchObject({ status: 'open', permissions: { copy: false } });
  });

  it('reopens a stored PDF after the project is reopened, with its password again', async () => {
    const { workspace, pdf } = setup();
    await workspace.importPdf(pdfFile(LOCKED_PDF), FAKE_PASSWORD);
    const projectId = workspace.state.store?.project.id ?? '';
    workspace.closeProject();
    expect(pdf.open_.size).toBe(0);
    expect(workspace.state.pdf).toEqual({});

    await workspace.openProject(projectId);
    expect(await workspace.openSource('id1')).toEqual({ status: 'locked', wrong: false });
    expect(await workspace.openSource('id1', 'nope')).toEqual({ status: 'locked', wrong: true });
    expect(await workspace.openSource('id1', FAKE_PASSWORD)).toMatchObject({ status: 'open' });
    expect(workspace.state.pdf['id1']).toMatchObject({ status: 'open' });
  });

  it('reports a source whose file is missing from storage', async () => {
    const { workspace } = setup();
    await workspace.createProject();
    expect(await workspace.openSource('gone')).toMatchObject({ status: 'failed', unavailable: false });
  });
});

describe('Workspace PDF crops', () => {
  const REQUEST = { pageIndex: 1, rectPt: [72, 72, 288, 216], dpi: 300, rotation: 0 } as const;

  async function withPdf(bytes = PLAIN_PDF) {
    const context = setup();
    const result = await context.workspace.importPdf(pdfFile(bytes, 'ASME VIII.pdf'));
    if (result.status !== 'added') throw new Error('expected the PDF to open');
    const store = context.workspace.state.store;
    if (!store) throw new Error('no project');
    return { ...context, store, sourceId: result.sourceId };
  }

  it('crops a page region into a new graph that records where it came from', async () => {
    const { workspace, store, sourceId, pdf, repo } = await withPdf();
    const result = await workspace.cropPdf(sourceId, REQUEST);
    expect(result).toEqual({ graphId: 'id3', dpi: 300, capped: false, renderMs: 1 });
    expect(pdf.crops).toEqual([{ key: sourceId, ...REQUEST }]);
    expect(store.project.graphs).toEqual([
      expect.objectContaining({
        id: 'id3',
        name: 'ASME VIII p2',
        source: { kind: 'pdfCrop', sourceId, ...REQUEST },
        image: { path: 'graphs/id3/original.png', width: 900, height: 600 },
      }),
    ]);
    expect(await repo.readFile(store.project.id, 'graphs/id3/original.png')).toEqual(PNG);
    store.undo();
    expect(store.project.graphs).toEqual([]);
  });

  it('caps the DPI of a crop over the pixel budget and says so (R7)', async () => {
    const { workspace, store, sourceId } = await withPdf();
    // A whole A1 sheet at 600 DPI would be about 278 Mpx.
    const result = await workspace.cropPdf(sourceId, { ...REQUEST, rectPt: [0, 0, 2384, 1684], dpi: 600 });
    expect(result.capped).toBe(true);
    expect(result.dpi).toBeLessThan(600);
    const graph = store.project.graphs[0];
    expect(graph?.source).toMatchObject({ dpi: result.dpi });
    expect((graph?.image.width ?? 0) * (graph?.image.height ?? 0)).toBeLessThanOrEqual(50_000_000);
  });

  it('refuses to crop a PDF whose permissions forbid copying (R6), or one that is not open', async () => {
    const { workspace, sourceId, store } = await withPdf(NO_COPY_PDF);
    await expect(workspace.cropPdf(sourceId, REQUEST)).rejects.toThrow(/copying/);
    await expect(workspace.cropPdf('missing', REQUEST)).rejects.toThrow(/not open/);
    expect(store.project.graphs).toEqual([]);
  });

  it('re-renders a crop at a higher DPI, rescaling its points and calibration in one undo step', async () => {
    const { workspace, store, sourceId, repo } = await withPdf();
    const { graphId } = await workspace.cropPdf(sourceId, { ...REQUEST, dpi: 150 });
    const points = [
      { id: 'p1', px: [100.5, 80.25] as const },
      { id: 'p2', px: [300, 40] as const },
    ].map((p) => ({
      ...p,
      value: [0, 0] as const,
      sigma: [0, 0] as const,
      excludedFromFit: false,
      outOfRange: false,
      origin: 'manual' as const,
    }));
    store.dispatch(
      addDataset(graphId, {
        id: 'd1',
        name: 'A',
        color: '#000000',
        mode: 'function',
        xUnit: '',
        yUnit: '',
        sourceRef: '',
        notes: '',
        points,
      }),
    );
    const before = store.project.graphs[0];

    const result = await workspace.rerenderGraph(graphId, 300);
    expect(result).toEqual({ dpi: 300, capped: false, renderMs: 1 });
    const after = store.project.graphs[0];
    expect(after?.source).toMatchObject({ dpi: 300, rectPt: REQUEST.rectPt });
    expect(after?.image).toEqual({ path: `graphs/${graphId}/render-300dpi.png`, width: 900, height: 600 });
    expect(await repo.readFile(store.project.id, after?.image.path ?? '')).toEqual(PNG);
    expect(after?.datasets[0]?.points.map((p) => p.px)).toEqual([
      [201, 160.5],
      [600, 80],
    ]);

    store.undo();
    expect(store.project.graphs[0]).toEqual(before);
  });

  it('refuses to re-render at the same DPI or a graph that is not a PDF crop', async () => {
    const { workspace, sourceId } = await withPdf();
    const { graphId } = await workspace.cropPdf(sourceId, REQUEST);
    await expect(workspace.rerenderGraph(graphId, 300)).rejects.toThrow(/already/);
    await workspace.importImages([{ name: 'x.png', bytes: PNG }]);
    const image = workspace.state.store?.project.graphs[1]?.id ?? '';
    await expect(workspace.rerenderGraph(image, 600)).rejects.toThrow(/not a PDF crop/);
  });
});

describe('Workspace autosave and crash recovery (R3)', () => {
  it('starts saving a change at once, so a reload right after an edit keeps it', async () => {
    const repo = new MemoryRepository();
    const save = vi.spyOn(repo, 'saveProject');
    const { workspace } = setup(repo);
    const store = await workspace.createProject('v0');
    save.mockClear();
    store.dispatch(renameProject('v1'));
    expect(save).not.toHaveBeenCalled();
    // One microtask later the write is under way, with no timer in between.
    await Promise.resolve();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]?.[0].name).toBe('v1');
  });

  it('reopens the project that was open when the tab went away, but not one that was closed', async () => {
    const repo = new MemoryRepository();
    const session = memorySession();
    const first = setup(repo, session).workspace;
    const store = await first.createProject('Pump curves');
    store.dispatch(renameProject('Pump curves v2'));
    await first.flush();

    // The tab is killed: a new workspace over the same storage.
    const second = setup(repo, session).workspace;
    expect((await second.restoreSession())?.project).toEqual(store.project);
    second.closeProject();
    expect(await setup(repo, session).workspace.restoreSession()).toBeNull();
  });

  it('forgets a remembered project that has been deleted', async () => {
    const repo = new MemoryRepository();
    const { workspace } = setup(repo, memorySession('gone'));
    expect(await workspace.restoreSession()).toBeNull();
  });
});

describe('Workspace .cdz (R2)', () => {
  it('round-trips a project through a .cdz onto another device', async () => {
    const { workspace, repo } = setup();
    await workspace.importImages([{ name: 'chart.png', bytes: PNG }]);
    const store = workspace.state.store;
    if (!store) throw new Error('no project');
    const saved = await workspace.saveCdz({ embedSources: false });
    expect(saved.fileName).toBe('chart');

    const other = setup();
    const opened = await other.workspace.importCdz({ name: 'chart.cdz', bytes: saved.bytes });
    expect(opened.project).toEqual(store.project);
    const path = store.project.graphs[0]?.image.path ?? '';
    expect(await other.repo.readFile(opened.project.id, path)).toEqual(
      await repo.readFile(store.project.id, path),
    );
    expect(other.workspace.state.projects.map((p) => p.name)).toEqual(['chart']);
  });

  it('opens a .cdz of a project already on this device as a copy, keeping the original', async () => {
    const { workspace } = setup();
    await workspace.importImages([{ name: 'chart.png', bytes: PNG }]);
    const originalId = workspace.state.store?.project.id;
    const saved = await workspace.saveCdz({ embedSources: false });
    const copy = await workspace.importCdz({ name: 'chart.cdz', bytes: saved.bytes });
    expect(copy.project.id).not.toBe(originalId);
    expect(copy.project.name).toBe('chart (copy)');
    expect(workspace.state.projects).toHaveLength(2);
  });

  it('carries source PDFs only when asked, and re-attaches a missing one by its content', async () => {
    const { workspace } = setup();
    await workspace.importPdf(pdfFile(PLAIN_PDF, 'pump.pdf'));

    const withPdfs = setup();
    const full = await withPdfs.workspace.importCdz({
      name: 'a.cdz',
      bytes: (await workspace.saveCdz({ embedSources: true })).bytes,
    });
    expect(full.project.sources[0]?.embedded).toBe(true);
    expect(await withPdfs.workspace.openSource('id1')).toMatchObject({ status: 'open' });

    const without = setup();
    const lean = await without.workspace.importCdz({
      name: 'b.cdz',
      bytes: (await workspace.saveCdz({ embedSources: false })).bytes,
    });
    expect(lean.project.sources[0]?.embedded).toBe(false);
    expect(await without.workspace.openSource('id1')).toMatchObject({
      status: 'failed',
      message: expect.stringMatching(/pump\.pdf is not stored with this project.*re-attach/) as string,
    });
    expect(await without.workspace.importPdf(pdfFile(PLAIN_PDF, 'pump (1).pdf'))).toEqual({
      status: 'existing',
      sourceId: 'id1',
    });
    expect(await without.repo.readFile(lean.project.id, sourcePath('id1'))).toEqual(PLAIN_PDF);
  });

  it('reports a file that is not a .cdz', async () => {
    const { workspace } = setup();
    await expect(workspace.importCdz({ name: 'x.cdz', bytes: PNG })).rejects.toThrow(/Not a zip archive/);
    expect(workspace.state.store).toBeNull();
  });
});
