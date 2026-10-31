import type { CdzContents } from '@cd/core';
import type { CdzFiles } from '@cd/workers';
import { computePool } from './compute';
import type { CdzCodec, SessionMarker } from './workspace';

const own = (bytes: Uint8Array): ArrayBuffer =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

function toFiles({ project, images, sources }: CdzContents): CdzFiles {
  return {
    project,
    images: Object.fromEntries([...images].map(([k, v]) => [k, own(v)])),
    sources: Object.fromEntries([...sources].map(([k, v]) => [k, own(v)])),
  };
}

const toMap = (files: Readonly<Record<string, ArrayBuffer>>) =>
  new Map(Object.entries(files).map(([k, v]) => [k, new Uint8Array(v)]));

/** `.cdz` zipping and unzipping in the compute pool (task 1.10); every buffer is transferred, not copied. */
export const workerCdz: CdzCodec = {
  async write(contents) {
    const files = toFiles(contents);
    const outcome = await computePool().run('cdzWrite', files, {
      transfer: [...Object.values(files.images), ...Object.values(files.sources)],
    });
    if (outcome.status !== 'done') throw new Error('Saving was cancelled.');
    return new Uint8Array(outcome.value.bytes);
  },
  async read(bytes) {
    const buffer = own(bytes);
    const outcome = await computePool().run('cdzRead', { bytes: buffer }, { transfer: [buffer] });
    if (outcome.status !== 'done') throw new Error('Opening was cancelled.');
    const { project, images, sources } = outcome.value;
    return { project, images: toMap(images), sources: toMap(sources) };
  },
};

const LAST_PROJECT_KEY = 'curve-digitizer:last-project';

/**
 * Remembers the open project in this origin's localStorage (never sent anywhere). Storage may be unavailable
 * (private windows, blocked site data); then the app simply starts at the project list.
 */
export const localSession: SessionMarker = {
  get() {
    try {
      return localStorage.getItem(LAST_PROJECT_KEY);
    } catch {
      return null;
    }
  },
  set(projectId) {
    try {
      if (projectId === null) localStorage.removeItem(LAST_PROJECT_KEY);
      else localStorage.setItem(LAST_PROJECT_KEY, projectId);
    } catch {
      // Not remembering only means the project list shows on the next start.
    }
  },
};
