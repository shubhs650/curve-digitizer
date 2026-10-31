import { type Project, readCdz, writeCdz } from '@cd/core';
import type { Task } from '../api.ts';

/** Files by path or id, as transferable buffers. */
export type FileBuffers = Readonly<Record<string, ArrayBuffer>>;

export interface CdzFiles {
  readonly project: Project;
  /** Graph images keyed by their path in the archive (`graphs/<id>/…`). */
  readonly images: FileBuffers;
  /** Embedded source PDFs keyed by source id. */
  readonly sources: FileBuffers;
}

const own = (bytes: Uint8Array): ArrayBuffer =>
  bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
    ? (bytes.buffer as ArrayBuffer)
    : (bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);

const toMap = (files: FileBuffers) => new Map(Object.entries(files).map(([k, v]) => [k, new Uint8Array(v)]));
const toRecord = (files: ReadonlyMap<string, Uint8Array>): Record<string, ArrayBuffer> =>
  Object.fromEntries([...files].map(([k, v]) => [k, own(v)]));

/** Zips a project into a `.cdz` (task 1.10): deflating megapixel images takes far longer than 50 ms. */
export const cdzWrite: Task<CdzFiles, { readonly bytes: ArrayBuffer }> = {
  run(input, ctx) {
    ctx.throwIfCancelled();
    const bytes = writeCdz({
      project: input.project,
      images: toMap(input.images),
      sources: toMap(input.sources),
    });
    return { bytes: own(bytes) };
  },
  transferables: ({ bytes }) => [bytes],
};

/** Unzips and migrates a `.cdz`; format problems are thrown with a message for the user. */
export const cdzRead: Task<{ readonly bytes: ArrayBuffer }, CdzFiles> = {
  run({ bytes }, ctx) {
    ctx.throwIfCancelled();
    const { project, images, sources } = readCdz(new Uint8Array(bytes));
    return { project, images: toRecord(images), sources: toRecord(sources) };
  },
  transferables: ({ images, sources }) => [...Object.values(images), ...Object.values(sources)],
};
