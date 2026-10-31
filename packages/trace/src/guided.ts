import { deltaE, type Raster, type Rgb, rgbToLab, sampleStrokeColor } from '@cd/image';
import { inkAt, type InkMap, inkMap, paperColor } from './ink.ts';
import type { Vec2 } from './snap.ts';

// Guided tracing (ARCHITECTURE §8.1, ADR 34). The tracer walks along the curve in small steps. At each step it
// scores straight look-ahead rays over a cone around the current heading by how much curve-coloured ink they
// cover, plus a turn penalty proportional to the turn angle, and steps along the best one; then it re-centres
// the new position across the stroke. The turn penalty is what carries it straight through a crossing; the
// colour model (ink map) is what makes grid lines invisible to it; short stretches without ink are bridged
// along the heading (dashed lines); two strong, divergent and nearly equally good rays stop it to ask.

/** Distance advanced per step, px. */
const STEP_PX = 1.5;
/** Look-ahead ray length and its sample spacing, px. */
const RAY_PX = 10;
/** Half-angle of the direction search, and its resolution, degrees. */
const CONE_DEG = 75;
const GAP_CONE_DEG = 12;
const ANGLE_STEP_DEG = 1.5;
/** Across-stroke profile half-length and sample spacing, px. */
const PROFILE_HALF_PX = 8;
const PROFILE_STEP_PX = 0.25;
/** Ink weight at which a profile sample belongs to a stroke. */
const RUN_LEVEL = 0.25;
/** A stroke this much wider than usual is two strokes touching (edge-centred), or a crossing (not re-centred). */
const TOUCHING_FACTOR = 1.3;
const CROSSING_FACTOR = 2.2;
/** Ambiguity: a second direction at least this far from the best, with this much ink, scoring within ε. */
const BRANCH_MIN_DEG = 15;
const BRANCH_MIN_INK = 0.6;
const BRANCH_EPSILON = 0.1;
/** After the user picks a branch, the tracer commits to it for this far before it may ask again, px. */
const COMMIT_PX = 2 * RAY_PX;
/** A curve colour closer than this (ΔE*ab) to the paper is no curve at all. */
export const MIN_CURVE_CONTRAST = 10;
/** Arc length over which the heading is re-estimated from the accepted centres, px. */
const TANGENT_PX = 6;
const DEG = Math.PI / 180;

export interface GuidedTraceOptions {
  /** A click on or near the curve. */
  readonly start: Vec2;
  /** Optional click where the trace should stop. Without one the curve is traced both ways to its ends. */
  readonly end?: Vec2;
  /** The curve's colour; sampled at `start` when absent (the eyedropper colour). */
  readonly color?: Rgb;
  /** Initial heading, e.g. the branch the user picked; otherwise the stroke's direction at `start`. */
  readonly direction?: Vec2;
  /** Spacing of the output points along the curve, px (the density setting). */
  readonly spacingPx?: number;
  /** Longest stretch without ink that is bridged (dashed lines, gaps at grid crossings), px. */
  readonly maxGapPx?: number;
  /** Cost per radian of turning, against ray costs in [0, 1]. */
  readonly turnPenalty?: number;
}

export interface TracePoint {
  readonly px: Vec2;
  /** Stroke width measured across the curve there, for the point's uncertainty (ARCHITECTURE §5). */
  readonly lineWidthPx: number;
}

/** A possible continuation at an ambiguity: its heading and a short straight preview for the UI to draw. */
export interface TraceBranch {
  readonly direction: Vec2;
  readonly preview: readonly [Vec2, Vec2];
}

interface TraceBase {
  /** Output points: Douglas–Peucker vertices (0.5 px) plus points every `spacingPx` along the path. */
  readonly points: readonly TracePoint[];
  /** Every accepted centre, in order. */
  readonly path: readonly Vec2[];
  readonly color: Rgb;
}

export type GuidedTraceResult =
  | (TraceBase & { readonly status: 'done'; readonly reachedEnd: boolean })
  | (TraceBase & {
      readonly status: 'ambiguous';
      /** Where the tracer stopped: the last point of `path`. */
      readonly at: Vec2;
      readonly branches: readonly TraceBranch[];
    });

export interface TraceHooks {
  /** Called every step with the fraction done; may throw to cancel. */
  readonly tick?: (fraction: number) => void;
  /** Awaited every few hundred steps, e.g. a worker checkpoint. */
  readonly checkpoint?: () => Promise<void>;
}

/** A path vertex with the stroke width measured there. */
export interface PathNode {
  readonly px: Vec2;
  readonly width: number;
}

const add = (a: Vec2, b: Vec2, s = 1): Vec2 => [a[0] + b[0] * s, a[1] + b[1] * s];
const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
const dot = (a: Vec2, b: Vec2): number => a[0] * b[0] + a[1] * b[1];
const norm = (a: Vec2): number => Math.hypot(a[0], a[1]);
const unit = (a: Vec2): Vec2 => {
  const n = norm(a);
  return n === 0 ? [1, 0] : [a[0] / n, a[1] / n];
};
const rotate = (a: Vec2, rad: number): Vec2 => [
  a[0] * Math.cos(rad) - a[1] * Math.sin(rad),
  a[0] * Math.sin(rad) + a[1] * Math.cos(rad),
];
const normalOf = (d: Vec2): Vec2 => [-d[1], d[0]];

/** Mean ink along the ray from `p` in direction `d`, sampled every px from 1 to RAY_PX. */
function rayInk(map: InkMap, p: Vec2, d: Vec2): number {
  let sum = 0;
  for (let t = 1; t <= RAY_PX; t++) sum += inkAt(map, p[0] + d[0] * t, p[1] + d[1] * t);
  return sum / RAY_PX;
}

interface DirectionChoice {
  readonly direction: Vec2;
  readonly ink: number;
  readonly branches: readonly TraceBranch[];
}

/** The best ray within ±coneDeg of `d`, and any rival that makes the choice ambiguous. */
function chooseDirection(
  map: InkMap,
  p: Vec2,
  d: Vec2,
  coneDeg: number,
  turnPenalty: number,
): DirectionChoice {
  const n = Math.round(coneDeg / ANGLE_STEP_DEG);
  const costs: number[] = [];
  const inks: number[] = [];
  for (let i = -n; i <= n; i++) {
    const rad = i * ANGLE_STEP_DEG * DEG;
    const ink = rayInk(map, p, rotate(d, rad));
    inks.push(ink);
    costs.push(1 - ink + turnPenalty * Math.abs(rad));
  }
  let best = 0;
  for (let i = 1; i < costs.length; i++) if ((costs[i] ?? Infinity) < (costs[best] ?? Infinity)) best = i;
  const angleOf = (i: number) => (i - n) * ANGLE_STEP_DEG * DEG;
  const direction = rotate(d, angleOf(best));
  const bestCost = costs[best] ?? Infinity;
  const rivals: number[] = [];
  if ((inks[best] ?? 0) >= BRANCH_MIN_INK) {
    for (let i = 0; i < costs.length; i++) {
      const c = costs[i] ?? Infinity;
      const isMinimum = c <= (costs[i - 1] ?? Infinity) && c <= (costs[i + 1] ?? Infinity);
      if (!isMinimum || i === best) continue;
      if (Math.abs(angleOf(i) - angleOf(best)) < BRANCH_MIN_DEG * DEG) continue;
      if ((inks[i] ?? 0) >= BRANCH_MIN_INK && c - bestCost < BRANCH_EPSILON) rivals.push(i);
    }
  }
  const branchOf = (i: number): TraceBranch => {
    const dir = rotate(d, angleOf(i));
    return { direction: dir, preview: [p, add(p, dir, 3 * RAY_PX)] };
  };
  return {
    direction,
    ink: inks[best] ?? 0,
    branches: rivals.length === 0 ? [] : [branchOf(best), ...rivals.map(branchOf)],
  };
}

interface Stroke {
  /** Offset of the stroke's centre from the profile's middle, along the normal. */
  readonly offset: number;
  /** ∫ink / peak across the stroke, px. */
  readonly width: number;
  /** Half-maximum edges, as offsets. */
  readonly lo: number;
  readonly hi: number;
}

/**
 * The stroke crossing the normal through `q` nearest to `q` (within `reach`), measured on the ink map: the
 * ink-weighted centroid of the run of samples above RUN_LEVEL, its width and half-maximum edges.
 */
function strokeAcross(map: InkMap, q: Vec2, normal: Vec2, reach: number): Stroke | null {
  const count = Math.round((2 * PROFILE_HALF_PX) / PROFILE_STEP_PX) + 1;
  const values = new Float64Array(count);
  const offsetOf = (i: number) => -PROFILE_HALF_PX + i * PROFILE_STEP_PX;
  for (let i = 0; i < count; i++) {
    const t = offsetOf(i);
    values[i] = inkAt(map, q[0] + normal[0] * t, q[1] + normal[1] * t);
  }
  let bestLo = -1;
  let bestHi = -1;
  let bestDistance = Infinity;
  for (let i = 0; i < count;) {
    if ((values[i] ?? 0) < RUN_LEVEL) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < count && (values[j + 1] ?? 0) >= RUN_LEVEL) j++;
    const a = offsetOf(i);
    const b = offsetOf(j);
    const distance = a <= 0 && b >= 0 ? 0 : Math.min(Math.abs(a), Math.abs(b));
    if (distance < bestDistance) {
      bestDistance = distance;
      bestLo = i;
      bestHi = j;
    }
    i = j + 1;
  }
  if (bestLo < 0 || bestDistance > reach) return null;
  // Extend the run into its tails (down to zero) so the centroid and width use the whole stroke.
  let lo = bestLo;
  let hi = bestHi;
  while (lo > 0 && (values[lo - 1] ?? 0) > 0 && (values[lo - 1] ?? 0) <= (values[lo] ?? 0)) lo--;
  while (hi < count - 1 && (values[hi + 1] ?? 0) > 0 && (values[hi + 1] ?? 0) <= (values[hi] ?? 0)) hi++;
  let total = 0;
  let moment = 0;
  let peak = 0;
  for (let i = lo; i <= hi; i++) {
    const v = values[i] ?? 0;
    total += v;
    moment += v * offsetOf(i);
    peak = Math.max(peak, v);
  }
  const half = peak / 2;
  let left = offsetOf(lo);
  for (let i = lo; i <= hi; i++) {
    const v = values[i] ?? 0;
    if (v >= half) {
      const prev = values[i - 1] ?? 0;
      left = i === lo || v === prev ? offsetOf(i) : offsetOf(i) - (PROFILE_STEP_PX * (v - half)) / (v - prev);
      break;
    }
  }
  let right = offsetOf(hi);
  for (let i = hi; i >= lo; i--) {
    const v = values[i] ?? 0;
    if (v >= half) {
      const next = values[i + 1] ?? 0;
      right =
        i === hi || v === next ? offsetOf(i) : offsetOf(i) + (PROFILE_STEP_PX * (v - half)) / (v - next);
      break;
    }
  }
  return { offset: moment / total, width: (total * PROFILE_STEP_PX) / peak, lo: left, hi: right };
}

/** Major axis of the ink's second moments within `radius` of `p`: the stroke's direction there. */
function strokeDirection(map: InkMap, p: Vec2, radius = 6): Vec2 {
  let sw = 0;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let dy = -radius; dy <= radius; dy += 0.5) {
    for (let dx = -radius; dx <= radius; dx += 0.5) {
      if (dx * dx + dy * dy > radius * radius) continue;
      const w = inkAt(map, p[0] + dx, p[1] + dy);
      sw += w;
      sx += w * dx;
      sy += w * dy;
      sxx += w * dx * dx;
      syy += w * dy * dy;
      sxy += w * dx * dy;
    }
  }
  if (sw === 0) return [1, 0];
  const mx = sx / sw;
  const my = sy / sw;
  const angle = 0.5 * Math.atan2(2 * (sxy / sw - mx * my), sxx / sw - mx * mx - (syy / sw - my * my));
  return [Math.cos(angle), Math.sin(angle)];
}

/** Moves `p` onto the centre of the nearest stroke across `direction`, if one is within a few px. */
function centreOn(
  map: InkMap,
  p: Vec2,
  direction: Vec2,
): { readonly px: Vec2; readonly width: number } | null {
  const normal = normalOf(direction);
  const stroke = strokeAcross(map, p, normal, 6);
  if (stroke === null) return null;
  const once = add(p, normal, stroke.offset);
  const again = strokeAcross(map, once, normalOf(strokeDirection(map, once)), 2);
  return again === null
    ? { px: once, width: stroke.width }
    : { px: add(once, normalOf(strokeDirection(map, once)), again.offset), width: again.width };
}

interface Walk {
  readonly nodes: PathNode[];
  readonly reachedEnd: boolean;
  readonly branches: readonly TraceBranch[];
}

interface WalkContext {
  readonly map: InkMap;
  readonly end: Vec2 | undefined;
  readonly maxGapPx: number;
  readonly turnPenalty: number;
  readonly maxSteps: number;
  readonly progress: (p: Vec2, step: number) => number;
  readonly hooks: TraceHooks;
}

/** Follows the curve from `start` (already centred) along `heading` until an end, a long gap or a branch. */
async function walk(ctx: WalkContext, start: PathNode, heading: Vec2, commitPx = 0): Promise<Walk> {
  const { map, end, maxGapPx, turnPenalty } = ctx;
  const nodes: PathNode[] = [start];
  // Indices into `nodes` of re-centred (not crossing, not gap) nodes, for the heading estimate.
  const clean: number[] = [0];
  let d = unit(heading);
  let p = start.px;
  let typical = start.width;
  let gapStart = -1;
  let arc = 0;
  const arcAt: number[] = [0];
  for (let step = 1; step <= ctx.maxSteps; step++) {
    ctx.hooks.tick?.(ctx.progress(p, step));
    if (step % 32 === 0) await ctx.hooks.checkpoint?.();
    if (end !== undefined && dot(sub(end, p), d) <= 0 && norm(sub(end, p)) < 4 * RAY_PX) {
      return { nodes, reachedEnd: true, branches: [] };
    }
    const narrow = gapStart >= 0 || arc < commitPx;
    const choice = chooseDirection(map, p, d, narrow ? GAP_CONE_DEG : CONE_DEG, turnPenalty);
    if (!narrow && choice.branches.length > 0) return { nodes, reachedEnd: false, branches: choice.branches };
    const dir = choice.ink > 0 ? choice.direction : d;
    const q = add(p, dir, STEP_PX);
    if (q[0] < 0 || q[1] < 0 || q[0] > map.width || q[1] > map.height) break;
    const stroke = strokeAcross(map, q, normalOf(dir), Math.max(2, 0.75 * typical));
    let next: PathNode;
    let isClean = false;
    if (stroke === null) {
      if (gapStart < 0) gapStart = nodes.length;
      next = { px: q, width: typical };
      d = dir;
    } else {
      gapStart = -1;
      if (stroke.width <= TOUCHING_FACTOR * typical + 0.5) {
        next = { px: add(q, normalOf(dir), stroke.offset), width: stroke.width };
        isClean = true;
      } else if (stroke.width <= CROSSING_FACTOR * typical + 1) {
        // Another stroke touches this one: keep the edge on the side of the prediction and measure from it.
        const fromLo = stroke.lo + typical / 2;
        const fromHi = stroke.hi - typical / 2;
        const offset = Math.abs(fromLo) < Math.abs(fromHi) ? fromLo : fromHi;
        next = { px: add(q, normalOf(dir), offset), width: typical };
      } else {
        // A crossing: hold the heading and go straight through.
        next = { px: q, width: typical };
      }
    }
    arc += norm(sub(next.px, p));
    nodes.push(next);
    arcAt.push(arc);
    p = next.px;
    if (gapStart >= 0) {
      const gapLength = arc - (arcAt[gapStart - 1] ?? 0);
      if (gapLength > maxGapPx) {
        nodes.length = gapStart;
        break;
      }
      continue;
    }
    if (isClean) {
      typical += 0.1 * (next.width - typical);
      clean.push(nodes.length - 1);
      // Heading: chord from the clean node about TANGENT_PX back to this one.
      let k = clean.length - 1;
      while (k > 0 && arc - (arcAt[clean[k] ?? 0] ?? 0) < TANGENT_PX) k--;
      const back = nodes[clean[k] ?? 0];
      if (back !== undefined && arc - (arcAt[clean[k] ?? 0] ?? 0) >= TANGENT_PX / 2)
        d = unit(sub(p, back.px));
      else d = dir;
    }
  }
  if (gapStart >= 0) nodes.length = gapStart;
  return { nodes, reachedEnd: false, branches: [] };
}

/** Douglas–Peucker: indices of the vertices that keep `path` within `tolerance` px. */
export function simplify(path: readonly Vec2[], tolerance: number): number[] {
  if (path.length <= 2) return path.map((_, i) => i);
  const keep = new Uint8Array(path.length);
  keep[0] = 1;
  keep[path.length - 1] = 1;
  const stack: [number, number][] = [[0, path.length - 1]];
  while (stack.length > 0) {
    const [a, b] = stack.pop() as [number, number];
    const pa = path[a] as Vec2;
    const pb = path[b] as Vec2;
    const ab = sub(pb, pa);
    const len = norm(ab);
    let worst = -1;
    let worstDistance = tolerance;
    for (let i = a + 1; i < b; i++) {
      const ap = sub(path[i] as Vec2, pa);
      const distance = len === 0 ? norm(ap) : Math.abs(ap[0] * ab[1] - ap[1] * ab[0]) / len;
      if (distance > worstDistance) {
        worst = i;
        worstDistance = distance;
      }
    }
    if (worst >= 0) {
      keep[worst] = 1;
      stack.push([a, worst], [worst, b]);
    }
  }
  return [...keep.keys()].filter((i) => keep[i]);
}

/** Output points of a path: its Douglas–Peucker vertices (0.5 px) plus a node every `spacing` px of arc. */
export function samplePoints(nodes: readonly PathNode[], spacing: number): TracePoint[] {
  if (nodes.length === 0) return [];
  const keep = new Set(
    simplify(
      nodes.map((n) => n.px),
      0.5,
    ),
  );
  let since = 0;
  for (let i = 1; i < nodes.length; i++) {
    since += norm(sub((nodes[i] as PathNode).px, (nodes[i - 1] as PathNode).px));
    if (keep.has(i)) since = 0;
    else if (since >= spacing) {
      keep.add(i);
      since = 0;
    }
  }
  return [...keep]
    .sort((a, b) => a - b)
    .map((i) => {
      const n = nodes[i] as PathNode;
      return { px: n.px, lineWidthPx: n.width };
    });
}

/** Thrown when there is no curve near the start click, or the picked colour is the paper's. */
export class NoCurveError extends Error {
  constructor(message = 'No curve near the start point') {
    super(message);
    this.name = 'NoCurveError';
  }
}

/**
 * Traces the curve through `options.start` on the processed image (ARCHITECTURE §8.1). Returns the traced
 * path and its output points, or stops at an ambiguity with the candidate branches so the UI can ask the user
 * and call again with `start` = `at` and `direction` = the chosen branch.
 */
export async function traceGuided(
  raster: Raster,
  options: GuidedTraceOptions,
  hooks: TraceHooks = {},
): Promise<GuidedTraceResult> {
  const color = options.color ?? sampleStrokeColor(raster, options.start[0], options.start[1]);
  const paper = paperColor(raster);
  if (deltaE(rgbToLab(...color), rgbToLab(...paper)) < MIN_CURVE_CONTRAST) throw new NoCurveError();
  const map = inkMap(raster, color, () => hooks.tick?.(0), paper);
  const spacing = options.spacingPx ?? 5;
  const initial = options.direction ?? strokeDirection(map, options.start);
  const centred = centreOn(map, options.start, initial);
  if (centred === null) throw new NoCurveError();
  const start: PathNode = { px: centred.px, width: centred.width };
  let heading = unit(options.direction ?? strokeDirection(map, start.px));
  if (
    options.end !== undefined &&
    options.direction === undefined &&
    dot(sub(options.end, start.px), heading) < 0
  ) {
    heading = [-heading[0], -heading[1]];
  }
  const total =
    options.end === undefined ? (raster.width + raster.height) / STEP_PX : norm(sub(options.end, start.px));
  let done = 0;
  const ctx: WalkContext = {
    map,
    end: options.end,
    maxGapPx: options.maxGapPx ?? 16,
    turnPenalty: options.turnPenalty ?? 0.6,
    maxSteps: Math.ceil((4 * (raster.width + raster.height)) / STEP_PX),
    progress: (p, step) => {
      const f = options.end === undefined ? step / total : 1 - norm(sub(options.end, p)) / total;
      done = Math.max(done, Math.min(0.99, f));
      return done;
    },
    hooks,
  };
  const forward = await walk(ctx, start, heading, options.direction === undefined ? 0 : COMMIT_PX);
  let nodes = forward.nodes;
  let branches = forward.branches;
  if (options.end === undefined && options.direction === undefined && branches.length === 0) {
    const backward = await walk(ctx, start, [-heading[0], -heading[1]]);
    // Keep the side that stopped at a branch last, so `at` is the end of the path.
    nodes =
      backward.branches.length > 0
        ? [...forward.nodes.slice(1).reverse(), ...backward.nodes]
        : [...backward.nodes.slice(1).reverse(), ...forward.nodes];
    branches = backward.branches;
  }
  hooks.tick?.(1);
  const path = nodes.map((n) => n.px);
  const points = samplePoints(nodes, spacing);
  if (branches.length > 0) {
    return { status: 'ambiguous', points, path, color, at: path[path.length - 1] ?? start.px, branches };
  }
  return { status: 'done', points, path, color, reachedEnd: forward.reachedEnd };
}
