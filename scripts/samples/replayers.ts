// Replayers turn a recorded op into the output a feature produces, by driving the real packages headlessly.
// Each feature task registers its replayer here when it lands; until then the harness reports the op's
// acceptance targets as todo. Expected owners (docs/MILESTONES.md): calibrate 1.3, manualPick 1.4,
// trace 2.3, colourMask 2.5, xStep 2.6.
import { fitCalibration, valueToAxis } from '@cd/math';
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

export const replayers: ReplayerRegistry = { calibrate };

/** The task in docs/MILESTONES.md that delivers each replayer, for the todo message. */
export const REPLAYER_TASKS: Readonly<Record<OpKind, string>> = {
  calibrate: '1.3',
  manualPick: '1.4',
  trace: '2.3',
  colourMask: '2.5',
  xStep: '2.6',
};
