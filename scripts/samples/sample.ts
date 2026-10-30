import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng, type RasterImage } from './png.ts';
import { checkOps, parseGroundTruth, parseOps, type GroundTruth, type Ops } from './truth.ts';

export const SAMPLES_DIR = fileURLToPath(new URL('../../samples/', import.meta.url));

/** Files every sample directory must contain (CLAUDE.md "Where things go"); source.svg is the vector source. */
export const SAMPLE_FILES = ['source.svg', 'source.png', 'ground-truth.json', 'ops.json', 'README.md'] as const;

export interface Sample {
  readonly name: string;
  readonly dir: string;
  readonly truth: GroundTruth;
  readonly ops: Ops;
  /** Decoded on first use; replayers get the pixels from here. */
  readonly image: () => RasterImage;
}

export function sampleNames(dir = SAMPLES_DIR): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

export function missingFiles(name: string, dir = SAMPLES_DIR): string[] {
  return SAMPLE_FILES.filter((f) => !existsSync(join(dir, name, f)));
}

export function loadSample(name: string, dir = SAMPLES_DIR): Sample {
  const root = join(dir, name);
  const readJson = (file: string): unknown => JSON.parse(readFileSync(join(root, file), 'utf8'));
  const truth = parseGroundTruth(readJson('ground-truth.json'));
  const ops = parseOps(readJson('ops.json'));
  checkOps(ops, truth);
  let image: RasterImage | undefined;
  return {
    name,
    dir: root,
    truth,
    ops,
    image: () => (image ??= decodePng(readFileSync(join(root, truth.image.path)))),
  };
}
