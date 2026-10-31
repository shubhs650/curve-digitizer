// Replayers turn a recorded op into the output a feature produces, by driving the real packages headlessly.
// Each feature task registers its replayer here when it lands; until then the harness reports the op's
// acceptance targets as todo. Expected owners (docs/MILESTONES.md): calibrate 1.3, manualPick 1.4,
// trace 2.3, colourMask 2.5, xStep 2.6.
import { fitCalibration, valueToAxis } from '@cd/math';
import { sampleStrokeColor } from '@cd/image';
import { nearestComponent, snapToCurve, traceColourMask, traceGuided } from '@cd/trace';
import type { Sample } from './sample.ts';
import type { ReplayOutputs } from './score.ts';
import type { Op, OpKind } from './truth.ts';

export type Replayer<K extends OpKind> = (
  op: Extract<Op, { kind: K }>,
  sample: Sample,
) => ReplayOutputs[K] | Promise<ReplayOutputs[K]>;

export type ReplayerRegistry = { readonly [K in OpKind]?: Replayer<K> };

/** Task 1.3: the calibration tool's solver on the recorded clicks and typed values. */
const calibrate: Replayer<'calibrate'> = (op, sample) => {
  const axes = { x: sample.truth.axes.x.type, y: sample.truth.axes.y.type };
  const points = op.points.map((p) => ({ px: p.px, axis: valueToAxis(p.value, axes) }));
  return { residualPx: fitCalibration(op.model, points, axes).residuals.rmsPx };
};

/** The app's default snap radius (docs/PROJECT_SCHEMA.md `settings.snapRadiusPx`). */
const SNAP_RADIUS_PX = 8;

/** Task 1.4: each recorded click through magnetic snap, as the point tool places it. */
const manualPick: Replayer<'manualPick'> = (op, sample) => {
  const image = sample.image();
  return {
    points: op.clicks.map((click) => (op.snap ? (snapToCurve(image, click, SNAP_RADIUS_PX)?.px ?? click) : click)),
  };
};

/** Task 2.3: the guided tracer from the start pick to the end pick on the unprocessed image, default settings. */
const trace: Replayer<'trace'> = async (op, sample) => {
  const result = await traceGuided(sample.image(), { start: op.start, end: op.end });
  return { points: result.points.map((p) => p.px), prompted: result.status === 'ambiguous' };
};

/**
 * Task 2.5: the colour-mask tracer with the eyedropper colour at the pick and default settings, keeping the
 * component the panel preselects (the one passing nearest the pick).
 */
const colourMask: Replayer<'colourMask'> = async (op, sample) => {
  const image = sample.image();
  const color = sampleStrokeColor(image, op.pick[0], op.pick[1]);
  const { components } = await traceColourMask(image, { color });
  const kept = components[nearestComponent(components, op.pick)];
  return { paths: kept ? [kept.path] : [] };
};

export const replayers: ReplayerRegistry = { calibrate, manualPick, trace, colourMask };

/** The task in docs/MILESTONES.md that delivers each replayer, for the todo message. */
export const REPLAYER_TASKS: Readonly<Record<OpKind, string>> = {
  calibrate: '1.3',
  manualPick: '1.4',
  trace: '2.3',
  colourMask: '2.5',
  xStep: '2.6',
};
