import type { Graph, Project } from '@cd/core';
import type { ExportFormat } from '@cd/workers';
import { computePool } from '../session/compute';
import { APP_VERSION } from '../version';
import { safeFileName } from './download';

export interface ExportedFile {
  readonly bytes: ArrayBuffer;
  readonly fileName: string;
  readonly mimeType: string;
}

const EXTENSIONS: Readonly<Record<ExportFormat, string>> = {
  csvLong: 'csv',
  csvWide: 'csv',
  xlsx: 'xlsx',
  audit: 'audit.json',
};

export function exportFileName(format: ExportFormat, project: Project, graph: Graph | null): string {
  const extension = EXTENSIONS[format];
  if (format === 'csvLong' || format === 'csvWide') {
    const suffix = format === 'csvWide' ? ' (wide)' : '';
    return safeFileName(`${project.name} - ${graph?.name ?? ''}${suffix}`, extension);
  }
  return safeFileName(project.name, extension);
}

/**
 * Builds an export in the compute pool (task 1.9). The audit JSON hashes every graph image and the workbook
 * embeds them (task 3.4), so for those they are read from project storage here and transferred to the worker.
 */
export async function runExport(
  format: ExportFormat,
  project: Project,
  graph: Graph | null,
  readFile: (path: string) => Promise<Uint8Array>,
): Promise<ExportedFile> {
  const images: Record<string, ArrayBuffer> = {};
  if (format === 'audit' || format === 'xlsx') {
    for (const g of project.graphs) {
      const bytes = await readFile(g.image.path);
      images[g.image.path] = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer;
    }
  }
  const outcome = await computePool().run(
    'exportFile',
    {
      format,
      project,
      ...(graph ? { graphId: graph.id } : {}),
      appVersion: APP_VERSION,
      exportedAt: new Date().toISOString(),
      userAgent: navigator.userAgent,
      images,
    },
    { transfer: Object.values(images) },
  );
  if (outcome.status !== 'done') throw new Error('Export was cancelled.');
  return { ...outcome.value, fileName: exportFileName(format, project, graph) };
}
