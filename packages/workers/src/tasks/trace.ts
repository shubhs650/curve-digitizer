import { applyStack, type StoredStep } from '@cd/image';
import { type GuidedTraceOptions, type GuidedTraceResult, traceGuided } from '@cd/trace';
import type { Task } from '../api.ts';
import { type ImageSource, loadSource, processedCache } from './source.ts';

export interface TraceCurveInput {
  readonly source: ImageSource;
  /** The graph's processing stack: the tracer reads processed pixels (PRD §4.6). */
  readonly steps: readonly StoredStep[];
  readonly options: GuidedTraceOptions;
}

/** Share of the progress bar given to the processing stack before the trace starts. */
const PROCESS_SHARE = 0.2;

/**
 * Guided trace (task 2.3) in the compute worker: processes the image (cached per stack hash, so a re-trace
 * reuses it), then runs the tracer with progress and cancellation.
 */
export const traceCurve: Task<TraceCurveInput, GuidedTraceResult> = {
  async run({ source, steps, options }, ctx) {
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
    return traceGuided(processed.raster, options, {
      tick: (fraction) => {
        ctx.throwIfCancelled();
        ctx.progress(PROCESS_SHARE + (1 - PROCESS_SHARE) * fraction, 'Tracing');
      },
      checkpoint: () => ctx.checkpoint(),
    });
  },
};
