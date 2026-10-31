import { applyStack, type StepIssue, type StoredStep } from '@cd/image';
import type { Task } from '../api.ts';
import { type ImageSource, loadSource, processedCache } from './source.ts';

export interface ProcessImageInput {
  readonly source: ImageSource;
  /** The graph's `processing` stack (docs/PROJECT_SCHEMA.md). */
  readonly steps: readonly StoredStep[];
}

export interface ProcessImageOutput {
  /** RGBA pixels of the processed image; transferred out. */
  readonly rgba: ArrayBuffer;
  readonly width: number;
  readonly height: number;
  /** `stackHash(steps)`. */
  readonly hash: string;
  /** Steps that were skipped (unknown op or invalid parameters). */
  readonly issues: readonly StepIssue[];
}

/**
 * Runs a processing stack for the pre-processing preview. Every step's output is cached in the worker under
 * the source key and the hash of the stack up to it, so changing the last step re-runs only that step.
 */
export const processImage: Task<ProcessImageInput, ProcessImageOutput> = {
  async run({ source, steps }, ctx) {
    const raster = await loadSource(source, ctx);
    const result = await applyStack(raster, steps, {
      cache: processedCache,
      sourceKey: source.key,
      tick: () => {
        ctx.throwIfCancelled();
      },
      beforeStep: async (index, count) => {
        ctx.progress(index / count);
        await ctx.checkpoint();
      },
    });
    ctx.progress(1);
    // The cache keeps its own buffer; the caller gets a copy it owns.
    const rgba = result.raster.data.slice().buffer;
    return {
      rgba,
      width: result.raster.width,
      height: result.raster.height,
      hash: result.hash,
      issues: result.issues,
    };
  },
  transferables: (output) => [output.rgba],
};
