import { sha256Hex } from './sha256.ts';
import type { Graph, Project } from './types.ts';

// docs/PROJECT_SCHEMA.md "Audit export".

export interface AuditImageRef {
  readonly path: string;
  readonly sha256: string;
  readonly width: number;
  readonly height: number;
}

export type AuditGraph = Omit<Graph, 'image'> & { readonly image: AuditImageRef };

export interface AuditInfo {
  /** ISO 8601. */
  readonly exportedAt: string;
  readonly appVersion: string;
  readonly userAgent: string;
}

export type AuditExport = Omit<Project, 'graphs'> & {
  readonly graphs: readonly AuditGraph[];
  readonly audit: AuditInfo;
};

/**
 * The provenance record: the whole project, with each graph image replaced by a reference carrying
 * the SHA-256 of its bytes so a checker can tie the numbers to the exact pixels.
 */
export async function createAudit(
  project: Project,
  images: ReadonlyMap<string, Uint8Array>,
  audit: AuditInfo,
): Promise<AuditExport> {
  const graphs = await Promise.all(
    project.graphs.map(async (graph): Promise<AuditGraph> => {
      const bytes = images.get(graph.image.path);
      if (!bytes) throw new Error(`Missing image "${graph.image.path}" for graph "${graph.id}"`);
      return { ...graph, image: { ...graph.image, sha256: await sha256Hex(bytes) } };
    }),
  );
  return { ...project, graphs, audit };
}

/** The exact text of a `*.audit.json` file. */
export function serializeAudit(audit: AuditExport): string {
  return `${JSON.stringify(audit, null, 2)}\n`;
}
