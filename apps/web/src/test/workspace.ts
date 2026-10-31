import { Workspace } from '../session/workspace';
import { MemoryRepository } from '../storage/memory';
import { FakePdfBackend } from './fakePdf';
import { TINY_PNG } from './png';

export { TINY_PNG };

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
