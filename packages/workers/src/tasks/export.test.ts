import { createProject, type Project } from '@cd/core';
import { describe, expect, it } from 'vitest';
import type { TaskContext } from '../api.ts';
import { exportFile, type ExportFileInput } from './export.ts';

const ctx: TaskContext = {
  cancelled: false,
  throwIfCancelled: () => undefined,
  progress: () => undefined,
  checkpoint: () => Promise.resolve(),
};

const project: Project = {
  ...createProject({ id: 'p', name: 'P', appVersion: '1', now: '2026-10-30T00:00:00.000Z' }),
  graphs: [
    {
      id: 'g1',
      name: 'G',
      source: { kind: 'image' },
      image: { path: 'graphs/g1/original.png', width: 10, height: 10 },
      processing: [],
      calibration: {
        xAxis: { type: 'linear', label: 'x' },
        yAxis: { type: 'linear', label: 'y' },
        model: 'affine',
        points: [],
        matrix: [1, 0, 0, 0, -1, 10, 0, 0, 1],
        residualPx: 0,
        resolution: { xUnitsPerPx: 1, yUnitsPerPx: 1 },
        warnings: [],
      },
      datasets: [],
      fits: [],
      view: { zoom: 1, pan: [0, 0] },
    },
  ],
};

const base: Omit<ExportFileInput, 'format'> = {
  project,
  graphId: 'g1',
  appVersion: '1',
  exportedAt: '2026-10-30T00:00:00.000Z',
  userAgent: 'test',
};

const text = (bytes: ArrayBuffer) => new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);

describe('exportFile', () => {
  it('writes CSV with a UTF-8 BOM', async () => {
    const out = await exportFile.run({ ...base, format: 'csvLong' }, ctx);
    expect(out.mimeType).toBe('text/csv');
    expect(text(out.bytes).startsWith('﻿# Curve Digitizer 1 export')).toBe(true);
    const wide = await exportFile.run({ ...base, format: 'csvWide' }, ctx);
    expect(text(wide.bytes)).toContain('x\r\n');
  });

  it('writes a workbook zip', async () => {
    const out = await exportFile.run({ ...base, format: 'xlsx' }, ctx);
    expect([...new Uint8Array(out.bytes, 0, 2)]).toEqual([0x50, 0x4b]);
    expect(exportFile.transferables?.(out)).toEqual([out.bytes]);
  });

  it('writes the audit JSON with image hashes', async () => {
    const out = await exportFile.run(
      { ...base, format: 'audit', images: { 'graphs/g1/original.png': new Uint8Array([1, 2, 3]).buffer } },
      ctx,
    );
    const audit = JSON.parse(text(out.bytes)) as { graphs: { image: { sha256: string } }[]; audit: object };
    expect(audit.graphs[0]?.image.sha256).toBe(
      '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81',
    );
    expect(audit.audit).toEqual({ exportedAt: base.exportedAt, appVersion: '1', userAgent: 'test' });
  });

  it('rejects an unknown graph', async () => {
    await expect(exportFile.run({ ...base, graphId: 'nope', format: 'csvLong' }, ctx)).rejects.toThrow(
      /No graph/,
    );
  });
});
