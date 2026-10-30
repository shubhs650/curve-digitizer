import { createAudit, type Project, serializeAudit } from '@cd/core';
import { csvLong, csvWide, ExportError, projectWorkbook } from '@cd/export';
import type { Task } from '../api.ts';

export type ExportFormat = 'csvLong' | 'csvWide' | 'xlsx' | 'audit';

export interface ExportFileInput {
  readonly format: ExportFormat;
  readonly project: Project;
  /** The graph a CSV export is for; ignored by the whole-project formats. */
  readonly graphId?: string;
  readonly appVersion: string;
  /** ISO 8601. */
  readonly exportedAt: string;
  readonly userAgent: string;
  /** Graph images by path, for the audit's SHA-256 references; transferred in. */
  readonly images?: Readonly<Record<string, ArrayBuffer>>;
}

export interface ExportFileOutput {
  /** The file's bytes; transferred out. */
  readonly bytes: ArrayBuffer;
  readonly mimeType: string;
}

/** UTF-8 byte order mark: without it Excel reads a CSV as the system code page and garbles "°C" and "m³". */
const BOM = '﻿';

const encode = (text: string): ArrayBuffer => new TextEncoder().encode(text).buffer;

/** Builds an export file (task 1.9) off the main thread: big projects take well over 50 ms to serialise. */
export const exportFile: Task<ExportFileInput, ExportFileOutput> = {
  async run(input, ctx) {
    const { format, project } = input;
    const info = { appVersion: input.appVersion, exportedAt: input.exportedAt };
    const graph = () => {
      const g = project.graphs.find((x) => x.id === input.graphId);
      if (!g) throw new ExportError(`No graph with id "${String(input.graphId)}"`);
      return g;
    };
    ctx.throwIfCancelled();
    switch (format) {
      case 'csvLong':
        return { bytes: encode(BOM + csvLong(project, graph(), info)), mimeType: 'text/csv' };
      case 'csvWide':
        return { bytes: encode(BOM + csvWide(project, graph(), info)), mimeType: 'text/csv' };
      case 'xlsx': {
        const bytes = projectWorkbook(project, info);
        return {
          bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        };
      }
      case 'audit': {
        const images = new Map(Object.entries(input.images ?? {}).map(([k, v]) => [k, new Uint8Array(v)]));
        const audit = await createAudit(project, images, {
          exportedAt: input.exportedAt,
          appVersion: input.appVersion,
          userAgent: input.userAgent,
        });
        return { bytes: encode(serializeAudit(audit)), mimeType: 'application/json' };
      }
    }
  },
  transferables: (output) => [output.bytes],
};
