import { Workspace } from '../session/workspace';
import { MemoryRepository } from '../storage/memory';
import { FakePdfBackend } from './fakePdf';

/** Signature + IHDR of a 3 × 2 PNG; the workspace stores PNG bytes as they are, so this is enough. */
export const TINY_PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 3, 0, 0, 0, 2,
  8, 2, 0, 0, 0,
]);

/** A workspace over memory storage with deterministic ids. */
export function testWorkspace(pdf = new FakePdfBackend()): Workspace {
  let id = 0;
  return new Workspace({
    repo: new MemoryRepository(),
    encodePng: () => Promise.reject(new Error('not used in tests')),
    pdf,
    newId: () => `id${String(++id)}`,
    now: () => new Date().toISOString(),
    appVersion: 'test',
  });
}

/** A workspace with one open project holding one graph made from TINY_PNG. */
export async function workspaceWithGraph(name = 'chart.png'): Promise<Workspace> {
  const workspace = testWorkspace();
  await workspace.importImages([{ name, bytes: TINY_PNG }]);
  return workspace;
}
