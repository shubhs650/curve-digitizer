import { type Rgb, sampleStrokeColor, type StoredStep } from '@cd/image';
import {
  type ColourMaskOptions,
  type ColourMaskResult,
  nearestComponent,
  traceColourMask,
  type Vec2,
} from '@cd/trace';
import type { Task } from '../api.ts';
import type { ImageSource } from './source.ts';
import { processedRaster, traceHooks } from './trace.ts';

export interface MaskCurvesInput {
  readonly source: ImageSource;
  /** The graph's processing stack: the mask reads processed pixels, like the guided tracer. */
  readonly steps: readonly StoredStep[];
  /** The eyedropper click on the curve. */
  readonly pick: Vec2;
  /** The curve colour; sampled at `pick` on the processed image when absent. */
  readonly color?: Rgb;
  readonly options?: Omit<ColourMaskOptions, 'color'>;
}

export interface MaskCurvesResult extends ColourMaskResult {
  /** The component passing nearest the pick, which the panel preselects; -1 when there is none. */
  readonly picked: number;
}

/** Colour-mask trace (task 2.5) in the compute worker, with progress and cancellation. */
export const maskCurves: Task<MaskCurvesInput, MaskCurvesResult> = {
  async run({ source, steps, pick, color, options }, ctx) {
    const raster = await processedRaster(source, steps, ctx);
    const result = await traceColourMask(
      raster,
      { ...options, color: color ?? sampleStrokeColor(raster, pick[0], pick[1]) },
      traceHooks(ctx, 'Finding curves'),
    );
    return { ...result, picked: nearestComponent(result.components, pick) };
  },
};
