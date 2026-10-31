import { CdzFormatError, createProject, type Project } from '@cd/core';
import { describe, expect, it } from 'vitest';
import type { TaskContext } from '../api.ts';
import { cdzRead, cdzWrite } from './cdz.ts';

const ctx: TaskContext = {
  cancelled: false,
  throwIfCancelled: () => undefined,
  progress: () => undefined,
  checkpoint: () => Promise.resolve(),
};

const project: Project = {
  ...createProject({ id: 'p', name: 'P', appVersion: '1', now: '2026-10-30T00:00:00.000Z' }),
  sources: [
    { id: 's1', kind: 'pdf', fileName: 'a.pdf', sha256: '0'.repeat(64), pageCount: 1, embedded: true },
  ],
  graphs: [
    {
      id: 'g1',
      name: 'G',
      source: { kind: 'image' },
      image: { path: 'graphs/g1/original.png', width: 3, height: 2 },
      processing: [],
      calibration: null,
      datasets: [],
      fits: [],
      view: { zoom: 1, pan: [0, 0] },
    },
  ],
};

const buffer = (...bytes: number[]) => new Uint8Array(bytes).buffer;

describe('cdz tasks', () => {
  it('round-trips a project with its images and embedded PDFs, transferring every buffer', async () => {
    const written = await cdzWrite.run(
      {
        project,
        images: { 'graphs/g1/original.png': buffer(1, 2, 3) },
        sources: { s1: buffer(37, 80, 68, 70) },
      },
      ctx,
    );
    expect(cdzWrite.transferables?.(written)).toEqual([written.bytes]);
    const read = await cdzRead.run({ bytes: written.bytes }, ctx);
    expect(read.project).toEqual(project);
    expect(new Uint8Array(read.images['graphs/g1/original.png'] ?? new ArrayBuffer(0))).toEqual(
      new Uint8Array([1, 2, 3]),
    );
    expect(new Uint8Array(read.sources['s1'] ?? new ArrayBuffer(0))).toEqual(
      new Uint8Array([37, 80, 68, 70]),
    );
    expect(cdzRead.transferables?.(read)).toHaveLength(2);
  });

  it('rejects a file that is not a .cdz', () => {
    expect(() => cdzRead.run({ bytes: buffer(1, 2, 3) }, ctx)).toThrow(CdzFormatError);
  });
});
