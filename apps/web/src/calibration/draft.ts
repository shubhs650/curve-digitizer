import type { Axis, AxisType, Calibration, CalibrationModel, Graph, PointValues, Vec2 } from '@cd/core';
import {
  axisCrossings,
  type CalibrationWarning,
  DegenerateError,
  fitCalibration,
  fromAxis,
  type CalibrationFit,
  toAxis,
} from '@cd/math';
import { pointCache } from '../points/cache';

// The calibration tool's editable state (PRD §4.3): four clicks, the values typed for them, the axes and the
// model. It becomes a `Calibration` once complete and valid; `evaluateDraft` is the only place that decides that.

/** The four calibration clicks, in this order everywhere: two on the X axis, two on the Y axis. */
export const PICKS = ['X1', 'X2', 'Y1', 'Y2'] as const;
export type PickIndex = 0 | 1 | 2 | 3;

export const isXPick = (i: PickIndex): boolean => i < 2;

/** Text fields of the draft, kept as typed so a half-typed number is not lost. */
export interface DraftValues {
  readonly x1: string;
  readonly x2: string;
  readonly y1: string;
  readonly y2: string;
  /** The Y value the X-axis clicks lie on; blank = solve where the axes cross. */
  readonly xAxisAt: string;
  /** The X value the Y-axis clicks lie on; blank = solve where the axes cross. */
  readonly yAxisAt: string;
}

export type ValueField = keyof DraftValues;

export interface CalibrationDraft {
  readonly picks: readonly [Vec2 | null, Vec2 | null, Vec2 | null, Vec2 | null];
  readonly values: DraftValues;
  readonly xAxis: Axis;
  readonly yAxis: Axis;
  readonly model: CalibrationModel;
}

export const EMPTY_DRAFT: CalibrationDraft = {
  picks: [null, null, null, null],
  values: { x1: '', x2: '', y1: '', y2: '', xAxisAt: '', yAxisAt: '' },
  xAxis: { type: 'linear', label: 'X' },
  yAxis: { type: 'linear', label: 'Y' },
  model: 'affine',
};

/** Shortest text that reads back as the same number. */
export function numberText(value: number): string {
  return String(Number(value.toPrecision(12)));
}

/** Residuals below this mean the crossings were solved, not typed (four picks fit an affine exactly). */
const EXACT_PX = 1e-6;

/** The draft that edits an existing calibration (picks are stored X1, X2, Y1, Y2). */
export function draftFromCalibration(calibration: Calibration | null): CalibrationDraft {
  if (calibration === null) return EMPTY_DRAFT;
  const [x1, x2, y1, y2] = calibration.points;
  if (!x1 || !x2 || !y1 || !y2) return { ...EMPTY_DRAFT, xAxis: calibration.xAxis, yAxis: calibration.yAxis };
  const x = (a: number) => numberText(fromAxis(a, calibration.xAxis.type));
  const y = (a: number) => numberText(fromAxis(a, calibration.yAxis.type));
  const solved = calibration.model === 'affine' && calibration.residualPx < EXACT_PX;
  return {
    picks: [x1.px, x2.px, y1.px, y2.px],
    values: {
      x1: x(x1.axis[0]),
      x2: x(x2.axis[0]),
      y1: y(y1.axis[1]),
      y2: y(y2.axis[1]),
      xAxisAt: solved ? '' : y(x1.axis[1]),
      yAxisAt: solved ? '' : x(y1.axis[0]),
    },
    xAxis: calibration.xAxis,
    yAxis: calibration.yAxis,
    model: calibration.model,
  };
}

export type DraftEvaluation =
  | {
      readonly status: 'incomplete';
      readonly missingPicks: readonly PickIndex[];
      readonly errors: FieldErrors;
    }
  | { readonly status: 'invalid'; readonly errors: FieldErrors; readonly message?: string }
  | {
      readonly status: 'ok';
      readonly calibration: Calibration;
      readonly fit: CalibrationFit;
      /** In data values; `solved` when the user left the field blank. */
      readonly crossings: { readonly xAxisAt: number; readonly yAxisAt: number; readonly solved: boolean };
    };

export type FieldErrors = Partial<Record<ValueField, string>>;

function parseAxisValue(text: string, type: AxisType): number | string {
  const trimmed = text.trim();
  if (trimmed === '') return 'Enter a value';
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return 'Enter a number';
  if (type === 'log10' && !(value > 0)) return 'A log axis needs a value above 0';
  return toAxis(value, type);
}

/** Validates the draft and, when complete, solves it into a calibration with its fit and warnings. */
export function evaluateDraft(draft: CalibrationDraft): DraftEvaluation {
  const { values, xAxis, yAxis } = draft;
  const errors: FieldErrors = {};
  const parse = (field: ValueField, type: AxisType, optional = false): number | null => {
    if (optional && values[field].trim() === '') return null;
    const parsed = parseAxisValue(values[field], type);
    if (typeof parsed === 'string') {
      errors[field] = parsed;
      return null;
    }
    return parsed;
  };
  const u1 = parse('x1', xAxis.type);
  const u2 = parse('x2', xAxis.type);
  const v1 = parse('y1', yAxis.type);
  const v2 = parse('y2', yAxis.type);
  const vAt = parse('xAxisAt', yAxis.type, true);
  const uAt = parse('yAxisAt', xAxis.type, true);
  if (u1 !== null && u1 === u2) errors.x2 = 'Use two different X values';
  if (v1 !== null && v1 === v2) errors.y2 = 'Use two different Y values';
  if (draft.model === 'projective') {
    if (vAt === null && errors.xAxisAt === undefined) errors.xAxisAt = 'Projective needs this value';
    if (uAt === null && errors.yAxisAt === undefined) errors.yAxisAt = 'Projective needs this value';
  }

  const missingPicks = ([0, 1, 2, 3] as const).filter((i) => draft.picks[i] === null);
  const [p1, p2, q1, q2] = draft.picks;
  if (!p1 || !p2 || !q1 || !q2) return { status: 'incomplete', missingPicks, errors };
  if (Object.keys(errors).length > 0 || u1 === null || u2 === null || v1 === null || v2 === null) {
    return { status: 'invalid', errors };
  }

  try {
    const solved = vAt === null || uAt === null;
    const crossings = solved
      ? axisCrossings(
          [
            { px: p1, axis: u1 },
            { px: p2, axis: u2 },
          ],
          [
            { px: q1, axis: v1 },
            { px: q2, axis: v2 },
          ],
        )
      : { xAxisAt: vAt, yAxisAt: uAt };
    // A typed crossing wins over the solved one for its axis.
    const v0 = vAt ?? crossings.xAxisAt;
    const u0 = uAt ?? crossings.yAxisAt;
    const points = [
      { px: p1, axis: [u1, v0] as const },
      { px: p2, axis: [u2, v0] as const },
      { px: q1, axis: [u0, v1] as const },
      { px: q2, axis: [u0, v2] as const },
    ];
    const axes = { x: xAxis.type, y: yAxis.type };
    const fit = fitCalibration(draft.model, points, axes);
    return {
      status: 'ok',
      fit,
      crossings: { xAxisAt: fromAxis(v0, yAxis.type), yAxisAt: fromAxis(u0, xAxis.type), solved },
      calibration: {
        xAxis,
        yAxis,
        model: draft.model,
        points,
        matrix: fit.matrix,
        residualPx: fit.residuals.rmsPx,
        resolution: fit.resolution,
        warnings: fit.warnings.map((w) => warningText(w, draft.model)),
      },
    };
  } catch (error) {
    if (!(error instanceof DegenerateError) && !(error instanceof RangeError)) throw error;
    return {
      status: 'invalid',
      errors,
      message:
        'These points do not define a calibration: the X clicks and the Y clicks must each be apart, on two crossing axes.',
    };
  }
}

/** The sentence stored in `Calibration.warnings` (PRD §4.3). */
export function warningText(warning: CalibrationWarning, model: CalibrationModel): string {
  switch (warning.kind) {
    case 'pointsTooClose':
      return `Two calibration points are only ${warning.distancePx.toFixed(1)} px apart; pick ticks further apart for a more accurate calibration.`;
    case 'skew':
      return `The axes are ${Math.abs(warning.degrees).toFixed(1)}° from square on the image (a skewed scan or photo); the calibration corrects for it.`;
    case 'highResidual':
      return `The calibration residual is ${warning.residualPx.toFixed(2)} px: check the typed values, where the axes cross, and the clicked positions${model === 'affine' ? ', or try projective for a photo taken at an angle' : ''}.`;
  }
}

/** The calibrated caches of a graph's points through `calibration`, for `setCalibration`. */
export function pointValues(graph: Graph, calibration: Calibration): PointValues {
  return new Map(
    graph.datasets.flatMap((d) => d.points.map((p) => [p.id, pointCache(calibration, p.px, p.lineWidthPx)])),
  );
}
