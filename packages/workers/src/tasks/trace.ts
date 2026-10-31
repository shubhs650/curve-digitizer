import { applyStack, type Raster, type StoredStep } from '@cd/image';
import { type GuidedTraceOptions, type GuidedTraceResult, traceGuided } from '@cd/trace';
import type { Task, TaskContext } from '../api.ts';
import { type ImageSource, loadSource, processedCache } from './source.ts';

export interface TraceCurveInput {
  readonly source: ImageSource;
  /** The graph's processing stack: the tracer reads processed pixels (PRD §4.6). */
  readonly steps: readonly StoredStep[];
  readonly options: GuidedTraceOptions;
}

/** Share of the progress bar given to the processing stack before the trace starts. */
const PROCESS_SHARE = 0.2;

/** The source through the stack (cached per stack hash, so a re-trace reuses it), as the first PROCESS_SHARE. */
export async function processedRaster(
  source: ImageSource,
  steps: readonly StoredStep[],
  ctx: TaskContext,
): Promise<Raster> {
  const raster = await loadSource(source, ctx);
  const processed = await applyStack(raster, steps, {
    cache: processedCache,
    sourceKey: source.key,
    tick: () => {
      ctx.throwIfCancelled();
    },
    beforeStep: async (index, count) => {
      ctx.progress((PROCESS_SHARE * index) / count, 'Processing');
      await ctx.checkpoint();
    },
  });
  return processed.raster;
}

/** Tracer hooks reporting into the rest of the progress bar after processing. */
export function traceHooks(ctx: TaskContext, label: string) {
  return {
    tick: (fraction: number) => {
      ctx.throwIfCancelled();
      ctx.progress(PROCESS_SHARE + (1 - PROCESS_SHARE) * fraction, label);
    },
    checkpoint: () => ctx.checkpoint(),
  };
}

/** Guided trace (task 2.3) in the compute worker on the processed image, with progress and cancellation. */
export const traceCurve: Task<TraceCurveInput, GuidedTraceResult> = {
  async run({ source, steps, options }, ctx) {
    return traceGuided(await processedRaster(source, steps, ctx), options, traceHooks(ctx, 'Tracing'));
  },
};
