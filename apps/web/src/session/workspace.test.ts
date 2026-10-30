import { renameProject } from '@cd/core';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRepository } from '../storage/memory';
import type { ProjectRepository } from '../storage/repository';
import { baseName, type PngEncoder, Workspace } from './workspace';

/** Signature + IHDR of a 3 × 2 PNG; enough for the workspace, which stores PNG bytes as they are. */
const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 3, 0, 0, 0, 2,
  8, 2, 0, 0, 0,
]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

function setup(repo: ProjectRepository = new MemoryRepository()) {
  let id = 0;
  let tick = 0;
  const encodePng = vi.fn<PngEncoder>(() => Promise.resolve({ png: PNG, width: 3, height: 2 }));
  const workspace = new Workspace({
    repo,
    encodePng,
    newId: () => `id${String(++id)}`,
    now: () => new Date(Date.UTC(2026, 10, 1, 0, 0, tick++)).toISOString(),
    appVersion: '0.0.0-test',
  });
  return { workspace, repo, encodePng };
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
