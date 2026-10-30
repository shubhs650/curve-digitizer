// Plane geometry for scoring replays against ground-truth centerlines. Pixel coordinates follow ADR 24.

export type Vec2 = readonly [number, number];

/** Row-major 3×3 homogeneous matrix, as `Calibration.matrix` in docs/PROJECT_SCHEMA.md. */
export type Mat3 = readonly [number, number, number, number, number, number, number, number, number];

export function applyMat3(m: Mat3, p: Vec2): Vec2 {
  const w = m[6] * p[0] + m[7] * p[1] + m[8];
  return [(m[0] * p[0] + m[1] * p[1] + m[2]) / w, (m[3] * p[0] + m[4] * p[1] + m[5]) / w];
}

export interface Polyline {
  readonly points: readonly Vec2[];
  /** Arc length from the first vertex to each vertex. */
  readonly cumulative: Float64Array;
  readonly length: number;
}

export function polyline(points: readonly Vec2[]): Polyline {
  const cumulative = new Float64Array(points.length);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (!a || !b) continue;
    cumulative[i] = (cumulative[i - 1] ?? 0) + Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return { points, cumulative, length: cumulative[points.length - 1] ?? 0 };
}

export interface Projection {
  /** Distance from the point to the nearest point of the polyline, px. */
  readonly distance: number;
  /** Arc-length position of that nearest point, px from the first vertex. */
  readonly s: number;
}

/** Nearest point on the polyline (brute force; centerlines have a few thousand vertices). */
export function project(line: Polyline, p: Vec2): Projection {
  let best: Projection = { distance: Infinity, s: 0 };
  const { points, cumulative } = line;
  if (points.length === 1 && points[0]) {
    return { distance: Math.hypot(p[0] - points[0][0], p[1] - points[0][1]), s: 0 };
  }
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (!a || !b) continue;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
    const distance = Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]);
    if (distance < best.distance) best = { distance, s: (cumulative[i - 1] ?? 0) + t * Math.sqrt(len2) };
  }
  return best;
}

/** Point at arc length `s` along the polyline (clamped to its ends). */
export function pointAt(line: Polyline, s: number): Vec2 {
  const { points, cumulative } = line;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const s1 = cumulative[i] ?? 0;
    if (!a || !b || s1 < s) continue;
    const s0 = cumulative[i - 1] ?? 0;
    const t = s1 === s0 ? 0 : Math.max(0, (s - s0) / (s1 - s0));
    return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
  }
  const last = points[points.length - 1];
  if (!last) throw new RangeError('empty polyline');
  return last;
}

/** Root mean square; NaN for an empty list. */
export function rms(values: readonly number[]): number {
  return Math.sqrt(values.reduce((sum, v) => sum + v * v, 0) / values.length);
}

/** Merges arc-length positions into intervals, starting a new one wherever consecutive positions are > maxGap apart. */
export function coveredIntervals(positions: readonly number[], maxGap: number): [number, number][] {
  const sorted = [...positions].sort((a, b) => a - b);
  const out: [number, number][] = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s - last[1] <= maxGap) last[1] = s;
    else out.push([s, s]);
  }
  return out;
}

/**
 * Fraction of `line`'s length lying within `tolerance` px of any of `others`, by the midpoint rule over
 * `step`-px pieces of arc.
 */
export function coveredLengthFraction(
  line: Polyline,
  others: readonly (readonly Vec2[])[],
  tolerance: number,
  step = 0.25,
): number {
  const candidates = others.filter((o) => o.length > 0).map(polyline);
  if (candidates.length === 0 || line.length === 0) return 0;
  const pieces = Math.ceil(line.length / step);
  let covered = 0;
  for (let k = 0; k < pieces; k++) {
    const s0 = k * step;
    const s1 = Math.min(line.length, s0 + step);
    const p = pointAt(line, (s0 + s1) / 2);
    if (candidates.some((c) => nearWithin(c, p, tolerance))) covered += s1 - s0;
  }
  return covered / line.length;
}

function nearWithin(line: Polyline, p: Vec2, tolerance: number): boolean {
  return project(line, p).distance <= tolerance;
}
