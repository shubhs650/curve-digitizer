import { MemoryRepository } from '../storage/memory';
import { hasOpfs, OpfsRepository } from '../storage/opfs';
import { APP_VERSION } from '../version';
import { workerPngEncoder } from './pngEncoder';
import { Workspace } from './workspace';

/** The app's workspace: projects in OPFS where the browser has it, otherwise in memory for this tab only. */
export function createWorkspace(): Workspace {
  return new Workspace({
    repo: hasOpfs() ? new OpfsRepository() : new MemoryRepository(),
    encodePng: workerPngEncoder,
    newId: () => crypto.randomUUID(),
    now: () => new Date().toISOString(),
    appVersion: APP_VERSION,
  });
}
