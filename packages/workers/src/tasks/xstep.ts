import type { StoredStep } from '@cd/image';
import { sampleXSteps, type XStepOptions, type XStepResult } from '@cd/trace';
import type { Task } from '../api.ts';
import type { ImageSource } from './source.ts';
import { processedRaster, traceHooks } from './trace.ts';

export interface SampleXStepsInput {
  readonly source: ImageSource;
  /** The graph's processing stack: the sampler traces processed pixels, like the guided tracer. */
  readonly steps: readonly StoredStep[];
  readonly options: XStepOptions;
}

/** X-step sampling (task 2.6) in the compute worker, with progress and cancellation. */
export const sampleCurveXs: Task<SampleXStepsInput, XStepResult> = {
  async run({ source, steps, options }, ctx) {
    return sampleXSteps(await processedRaster(source, steps, ctx), options, traceHooks(ctx, 'Sampling'));
  },
};
