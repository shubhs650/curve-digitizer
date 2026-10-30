import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { migrate } from './migrations/index.ts';
import { serializeProject } from './project.ts';
import type { Project } from './types.ts';

// docs/PROJECT_SCHEMA.md "Container: .cdz".
const PROJECT_JSON = 'project.json';
const README_TXT = 'README.txt';
const DEFLATE_LEVEL = 6;
const SOURCE_PATH = /^sources\/([^/]+)\.pdf$/;

const README = `This is a Curve Digitizer project (.cdz): a zip archive holding project.json (the
calibration, every digitized point, fits and their provenance), the cropped graph images under
graphs/, and optionally the source PDFs under sources/. Open it at
https://curve-digitizer.openengtools.com or inspect it with any zip tool.
`;

export interface CdzContents {
  readonly project: Project;
  /** Files under `graphs/`, keyed by their path in the archive (e.g. `graphs/g1/original.png`). */
  readonly images: ReadonlyMap<string, Uint8Array>;
  /** Embedded source PDFs keyed by source id; empty when the PDFs were not embedded. */
  readonly sources: ReadonlyMap<string, Uint8Array>;
}

/** Raised when an archive is not a readable `.cdz`. Schema problems raise `ProjectFormatError`. */
export class CdzFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CdzFormatError';
  }
}

/**
 * Builds a `.cdz`. Synchronous and CPU-bound on large images: call it from a worker.
 * Entries are stamped with `project.modified` so the same project always gives the same bytes.
 */
export function writeCdz({ project, images, sources }: CdzContents): Uint8Array {
  const mtime = new Date(project.modified);
  const files: Zippable = {
    [PROJECT_JSON]: strToU8(serializeProject(project)),
    [README_TXT]: strToU8(README),
  };
  for (const graph of project.graphs) {
    if (!images.has(graph.image.path)) {
      throw new CdzFormatError(`Missing image "${graph.image.path}" for graph "${graph.id}"`);
    }
  }
  for (const [path, bytes] of images) {
    if (!path.startsWith('graphs/')) throw new CdzFormatError(`Image path "${path}" must be under graphs/`);
    files[path] = bytes;
  }
  for (const [id, bytes] of sources) files[`sources/${id}.pdf`] = bytes;
  return zipSync(files, { level: DEFLATE_LEVEL, mtime });
}

/** Opens a `.cdz`, migrating `project.json` to the current schema. Call it from a worker. */
export function readCdz(bytes: Uint8Array): CdzContents {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch (error) {
    throw new CdzFormatError(`Not a zip archive: ${error instanceof Error ? error.message : String(error)}`);
  }
  const projectBytes = entries[PROJECT_JSON];
  if (!projectBytes) throw new CdzFormatError(`Archive has no ${PROJECT_JSON}`);

  let json: unknown;
  try {
    json = JSON.parse(strFromU8(projectBytes));
  } catch (error) {
    throw new CdzFormatError(
      `${PROJECT_JSON} is not JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const project = migrate(json);

  const images = new Map<string, Uint8Array>();
  const sources = new Map<string, Uint8Array>();
  for (const [path, data] of Object.entries(entries)) {
    if (path.startsWith('graphs/') && !path.endsWith('/')) images.set(path, data);
    const source = SOURCE_PATH.exec(path);
    if (source?.[1] !== undefined) sources.set(source[1], data);
  }
  for (const graph of project.graphs) {
    if (!images.has(graph.image.path)) {
      throw new CdzFormatError(`Archive is missing "${graph.image.path}" for graph "${graph.id}"`);
    }
  }
  return { project, images, sources };
}
