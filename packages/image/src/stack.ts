import { FILTER_OPS, parseStep, type StepIssue } from './ops.ts';
import { type FilterOp, type RgbaRaster, type StepParams, toRgba } from './ops/types.ts';
import type { Raster } from './raster.ts';

/** A processing step as stored in the project (docs/PROJECT_SCHEMA.md `processing[]`). */
export type StoredStep = { readonly op: string } & StepParams;

/** JSON with object keys sorted at every level, so equal steps serialise identically whatever their key order. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return value === undefined ? 'null' : JSON.stringify(value);
}

/**
 * cyrb53 (a public-domain 53-bit string hash): two 32-bit multiply-xorshift lanes mixed at the end. Cache keys
 * only; a collision would show a stale preview, never change project data.
 */
function cyrb53(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

/** Hash of a processing stack (ARCHITECTURE §7: processed bitmaps are cached per graph and stack hash). */
export function stackHash(steps: readonly StoredStep[]): string {
  return cyrb53(canonicalJson(steps));
}

/** A least-recently-used cache of processed rasters, bounded by their total byte size. */
export class RasterCache {
  readonly #entries = new Map<string, RgbaRaster>();
  readonly #maxBytes: number;
  #bytes = 0;

  constructor(maxBytes: number) {
    this.#maxBytes = maxBytes;
  }

  get bytes(): number {
    return this.#bytes;
  }

  get size(): number {
    return this.#entries.size;
  }

  get(key: string): RgbaRaster | undefined {
    const hit = this.#entries.get(key);
    if (hit !== undefined) {
      this.#entries.delete(key);
      this.#entries.set(key, hit);
    }
    return hit;
  }

  set(key: string, raster: RgbaRaster): void {
    this.delete(key);
    if (raster.data.byteLength > this.#maxBytes) return;
    this.#entries.set(key, raster);
    this.#bytes += raster.data.byteLength;
    for (const [oldest, value] of this.#entries) {
      if (this.#bytes <= this.#maxBytes) break;
      this.#entries.delete(oldest);
      this.#bytes -= value.data.byteLength;
    }
  }

  delete(key: string): void {
    const old = this.#entries.get(key);
    if (old === undefined) return;
    this.#entries.delete(key);
    this.#bytes -= old.data.byteLength;
  }

  clear(): void {
    this.#entries.clear();
    this.#bytes = 0;
  }
}

export interface ApplyStackOptions {
  /** Caches each step's output under `${sourceKey}:${stackHash(prefix)}`, so editing the last step reuses the rest. */
  readonly cache?: RasterCache;
  /** Identifies the source pixels (e.g. graph id + image path); required for `cache`. */
  readonly sourceKey?: string;
  /** Called at least once per row inside every filter; may throw to cancel. */
  readonly tick?: () => void;
  /** Awaited before each step, e.g. a worker checkpoint that yields and reports progress. */
  readonly beforeStep?: (index: number, count: number) => void | Promise<void>;
}

export interface StackResult {
  readonly raster: RgbaRaster;
  readonly hash: string;
  /** Steps that were skipped because their op is unknown or their parameters are invalid. */
  readonly issues: readonly StepIssue[];
}

/**
 * Runs the processing stack over `source` (never modified). Steps run in order; unknown or invalid steps are
 * skipped and reported. With a cache, the longest cached prefix of the stack is reused.
 */
export async function applyStack(
  source: Raster,
  steps: readonly StoredStep[],
  options: ApplyStackOptions = {},
): Promise<StackResult> {
  const { cache, sourceKey, tick = () => undefined, beforeStep } = options;
  const keyOf = (n: number) => `${sourceKey ?? ''}:${stackHash(steps.slice(0, n))}`;
  const useCache = cache !== undefined && sourceKey !== undefined;
  const issues: StepIssue[] = [];
  const parsed = steps.map((step, index) => {
    const result = parseStep(step);
    if (!result.ok) issues.push({ index, op: step.op, message: result.message });
    return result.ok ? result.step : null;
  });

  let start = 0;
  let raster: RgbaRaster | undefined;
  if (useCache) {
    for (let n = steps.length; n > 0; n--) {
      raster = cache.get(keyOf(n));
      if (raster !== undefined) {
        start = n;
        break;
      }
    }
  }
  raster ??=
    source.channels === 4 && source.data instanceof Uint8ClampedArray
      ? (source as RgbaRaster)
      : toRgba(source);
  for (let i = start; i < steps.length; i++) {
    await beforeStep?.(i, steps.length);
    const step = parsed[i];
    if (step) raster = (FILTER_OPS[step.op] as FilterOp<StepParams>).apply(raster, step.params, tick);
    if (useCache) cache.set(keyOf(i + 1), raster);
  }
  return { raster, hash: stackHash(steps), issues };
}
