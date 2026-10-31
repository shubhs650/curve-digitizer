// The closed set of pre-processing filters (docs/PROJECT_SCHEMA.md `processing[].op`). A project step whose
// `op` is not here, or whose parameters do not parse, is kept in the file but skipped, with a warning.
import { isolateColor } from './ops/color.ts';
import { despeckle } from './ops/despeckle.ts';
import { gridSuppress } from './ops/grid.ts';
import { brightness, contrast, grayscale, invert, threshold } from './ops/tone.ts';
import type { FilterOp, StepParams } from './ops/types.ts';

export const FILTER_OPS = {
  brightness,
  contrast,
  grayscale,
  invert,
  threshold,
  despeckle,
  gridSuppress,
  isolateColor,
} as const;

export type FilterOpName = keyof typeof FILTER_OPS;
export type FilterParams<K extends FilterOpName> = (typeof FILTER_OPS)[K]['defaults'];

export const FILTER_OP_NAMES = Object.keys(FILTER_OPS) as readonly FilterOpName[];

export function isFilterOpName(op: string): op is FilterOpName {
  return Object.hasOwn(FILTER_OPS, op);
}

/** A stored step whose op and parameters are usable, with defaults filled in. */
export interface ParsedStep {
  readonly op: FilterOpName;
  readonly params: StepParams;
}

/** Why a stored step is skipped. */
export interface StepIssue {
  readonly index: number;
  readonly op: string;
  readonly message: string;
}

export type ParseStepResult =
  { readonly ok: true; readonly step: ParsedStep } | { readonly ok: false; readonly message: string };

/** Validates one stored step (`{ op, ...params }`). */
export function parseStep(step: { readonly op: string } & StepParams): ParseStepResult {
  const { op, ...params } = step;
  if (!isFilterOpName(op)) return { ok: false, message: `unknown filter "${op}"` };
  try {
    const def = FILTER_OPS[op] as FilterOp<StepParams>;
    return { ok: true, step: { op, params: def.parse(params) } };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

export { FilterParamError, type FilterOp, type RgbaRaster, type StepParams, toRgba } from './ops/types.ts';
export { STRETCH_CLIP } from './ops/tone.ts';
