// Scores a replayed op against ground truth for one acceptance target (docs/ACCEPTANCE_TARGETS.md).
// The limits below are copied from that document; change them only together with it.
import { coveredIntervals, coveredLengthFraction, polyline, project, rms, type Polyline, type Vec2 } from './geometry.ts';
import type { GroundTruth, Op, OpKind, TargetId, TruthDataset } from './truth.ts';

/** What a replayer must return for each op kind. */
export interface ReplayOutputs {
  readonly calibrate: { readonly residualPx: number };
  readonly manualPick: { readonly points: readonly Vec2[] };
  /** `prompted`: the tracer stopped to ask the user which branch to follow. */
  readonly trace: { readonly points: readonly Vec2[]; readonly prompted: boolean };
  /** The ordered centerline of each component the user keeps. */
  readonly colourMask: { readonly paths: readonly (readonly Vec2[])[] };
  /** One point per requested X, in the op's order, and how many the sampler flagged as outliers. */
  readonly xStep: { readonly points: readonly Vec2[]; readonly outliers: number };
}

export interface TargetSpec {
  readonly opKind: OpKind;
  /** Per sample: the target's number (max px, max count or min fraction; see `summary`). */
  readonly limits: Readonly<Record<string, number>>;
  readonly summary: string;
}

export const TARGETS: Readonly<Record<TargetId, TargetSpec>> = {
  A1: { opKind: 'calibrate', limits: { 'vector-clean': 0.3, 'sn-family': 0.3 }, summary: 'calibration RMS residual ≤ limit px' },
  A2: { opKind: 'manualPick', limits: { 'vector-clean': 0.5 }, summary: 'snapped picks ≤ limit px RMS from the centerline' },
  A3: {
    opKind: 'trace',
    limits: { 'vector-clean': 1.0, 'scan-tilted': 2.0 },
    summary: 'guided trace ≤ limit px RMS from the centerline',
  },
  A4: {
    opKind: 'trace',
    limits: { 'sn-family': 0 },
    summary: 'guided trace crosses every intersection with ≤ limit wrong-branch points and no prompt',
  },
  A5: { opKind: 'colourMask', limits: { 'vector-clean': 0.98 }, summary: 'colour mask recovers ≥ limit of the curve length' },
  A6: { opKind: 'xStep', limits: { 'vector-clean': 0.5 }, summary: 'X-step ≤ limit px RMS at the requested X values, 0 outliers' },
};

/**
 * Interpretation constants (ADR 24). A trace must follow the curve from start to end, not just stay near it:
 * at least TRACE_MIN_COVERAGE of the arc between the picks must be covered, with gaps between consecutive points
 * of at most COVERAGE_GAP_PX. For A4 a point farther than WRONG_BRANCH_PX from its own curve is on a wrong branch,
 * and an intersection counts as crossed when coverage extends CROSSING_MARGIN_PX past it on both sides. For A5 a
 * piece of the curve is recovered when it is within COLOUR_MASK_MATCH_PX of a kept component.
 */
export const TRACE_MIN_COVERAGE = 0.95;
export const COVERAGE_GAP_PX = 10;
export const WRONG_BRANCH_PX = 4;
export const CROSSING_MARGIN_PX = 5;
export const COLOUR_MASK_MATCH_PX = 2;

export interface Score {
  readonly pass: boolean;
  /** The measured numbers, for the test name and the log. */
  readonly measured: string;
  readonly failures: readonly string[];
}

const px = (v: number): string => `${v.toFixed(3)} px`;
const pct = (v: number): string => `${(v * 100).toFixed(1)} %`;
const limitPct = (v: number): string => `${String(Math.round(v * 1000) / 10)} %`;

function datasetOf(truth: GroundTruth, id: string): TruthDataset {
  const ds = truth.datasets.find((d) => d.id === id);
  if (!ds) throw new Error(`unknown dataset ${id}`);
  return ds;
}

function done(measured: string, failures: string[]): Score {
  return { pass: failures.length === 0, measured, failures };
}

function rmsCheck(distances: readonly number[], limit: number, failures: string[]): number {
  const value = rms(distances);
  if (!(value <= limit)) failures.push(`RMS distance ${px(value)} > ${String(limit)} px`);
  return value;
}

/** Fraction of the arc between the projections of `from` and `to` covered by the projected points. */
function coverage(line: Polyline, positions: readonly number[], from: Vec2, to: Vec2): number {
  const a = project(line, from).s;
  const b = project(line, to).s;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  if (hi === lo) return 1;
  const covered = coveredIntervals(positions, COVERAGE_GAP_PX).reduce(
    (sum, [s0, s1]) => sum + Math.max(0, Math.min(s1, hi) - Math.max(s0, lo)),
    0,
  );
  return covered / (hi - lo);
}

export function score<K extends OpKind>(
  target: TargetId,
  limit: number,
  op: Extract<Op, { kind: K }>,
  output: ReplayOutputs[K],
  truth: GroundTruth,
): Score {
  const spec = TARGETS[target];
  if (spec.opKind !== op.kind) throw new Error(`${target} scores ${spec.opKind} ops, not ${op.kind}`);
  const failures: string[] = [];
  // `op.kind` narrows `op`; the output type follows from it because `score` is generic in K.
  const o = op as Op;
  switch (o.kind) {
    case 'calibrate': {
      const { residualPx } = output as ReplayOutputs['calibrate'];
      if (!(residualPx <= limit)) failures.push(`RMS residual ${px(residualPx)} > ${String(limit)} px`);
      return done(`residual ${px(residualPx)}`, failures);
    }
    case 'manualPick': {
      const { points } = output as ReplayOutputs['manualPick'];
      if (points.length !== o.clicks.length) {
        failures.push(`expected ${String(o.clicks.length)} points, got ${String(points.length)}`);
      }
      const line = polyline(datasetOf(truth, o.datasetId).centerline);
      const value = rmsCheck(points.map((p) => project(line, p).distance), limit, failures);
      return done(`RMS ${px(value)} over ${String(points.length)} points`, failures);
    }
    case 'trace': {
      const { points, prompted } = output as ReplayOutputs['trace'];
      const line = polyline(datasetOf(truth, o.datasetId).centerline);
      const projections = points.map((p) => project(line, p));
      if (target === 'A4') return scoreBranches(o, line, projections, prompted, limit, truth);
      const value = rmsCheck(
        projections.map((p) => p.distance),
        limit,
        failures,
      );
      const covered = points.length === 0 ? 0 : coverage(line, projections.map((p) => p.s), o.start, o.end);
      if (!(covered >= TRACE_MIN_COVERAGE)) {
        failures.push(`covers ${pct(covered)} of the curve between start and end, needs ≥ ${limitPct(TRACE_MIN_COVERAGE)}`);
      }
      return done(`RMS ${px(value)}, coverage ${pct(covered)}`, failures);
    }
    case 'colourMask': {
      const { paths } = output as ReplayOutputs['colourMask'];
      const line = polyline(datasetOf(truth, o.datasetId).centerline);
      const fraction = coveredLengthFraction(line, paths, COLOUR_MASK_MATCH_PX);
      if (!(fraction >= limit)) {
        failures.push(`recovers ${pct(fraction)} of the curve length, needs ≥ ${limitPct(limit)}`);
      }
      return done(`recovers ${pct(fraction)}`, failures);
    }
    case 'xStep': {
      const { points, outliers } = output as ReplayOutputs['xStep'];
      if (points.length !== o.xs.length) {
        failures.push(`expected ${String(o.xs.length)} points, got ${String(points.length)}`);
      }
      if (outliers !== 0) failures.push(`${String(outliers)} outliers, needs 0`);
      const ds = datasetOf(truth, o.datasetId);
      const distances = points.slice(0, o.xs.length).map((p, i) => {
        const expected = ds.samples.find((s) => s.value[0] === o.xs[i]);
        if (!expected) throw new Error(`X ${String(o.xs[i])} is not a ground-truth sample of ${ds.id}`);
        return Math.hypot(p[0] - expected.px[0], p[1] - expected.px[1]);
      });
      const value = rmsCheck(distances, limit, failures);
      return done(`RMS ${px(value)}, ${String(outliers)} outliers`, failures);
    }
  }
}

function scoreBranches(
  { datasetId, start, end }: Extract<Op, { kind: 'trace' }>,
  line: Polyline,
  projections: readonly { distance: number; s: number }[],
  prompted: boolean,
  maxWrong: number,
  truth: GroundTruth,
): Score {
  const failures: string[] = [];
  if (prompted) failures.push('asked the user to pick a branch');
  const wrong = projections.filter((p) => p.distance > WRONG_BRANCH_PX);
  if (wrong.length > maxWrong) {
    const farthest = Math.max(...wrong.map((p) => p.distance));
    failures.push(`${String(wrong.length)} points on a wrong branch (farthest ${farthest.toFixed(1)} px)`);
  }
  const onCurve = projections.filter((p) => p.distance <= WRONG_BRANCH_PX).map((p) => p.s);
  const intervals = coveredIntervals(onCurve, COVERAGE_GAP_PX);
  const a = project(line, start).s;
  const b = project(line, end).s;
  let crossed = 0;
  for (const c of truth.intersections) {
    if (!c.datasets.includes(datasetId)) continue;
    const s = project(line, c.px).s;
    if (s < Math.min(a, b) || s > Math.max(a, b)) continue;
    const ok = intervals.some(([s0, s1]) => s0 <= s - CROSSING_MARGIN_PX && s1 >= s + CROSSING_MARGIN_PX);
    if (ok) crossed++;
    else {
      const other = c.datasets[0] === datasetId ? c.datasets[1] : c.datasets[0];
      failures.push(`does not cross the intersection with ${other} at (${c.px[0].toFixed(1)}, ${c.px[1].toFixed(1)})`);
    }
  }
  return done(`${String(wrong.length)} wrong-branch points, ${String(crossed)} intersections crossed`, failures);
}
