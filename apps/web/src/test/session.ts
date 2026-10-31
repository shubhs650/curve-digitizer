import { readCdz, writeCdz } from '@cd/core';
import type { CdzCodec, SessionMarker } from '../session/workspace';

/** The `.cdz` codec run in the test's own thread instead of the compute worker. */
export const inProcessCdz: CdzCodec = {
  write: (contents) => Promise.resolve(writeCdz(contents)),
  read: (bytes) => Promise.resolve(readCdz(bytes)),
};

/** A session marker held in memory; share one between workspaces to model a reopened tab. */
export function memorySession(initial: string | null = null): SessionMarker & { value: string | null } {
  return {
    value: initial,
    get() {
      return this.value;
    },
    set(projectId) {
      this.value = projectId;
    },
  };
}
