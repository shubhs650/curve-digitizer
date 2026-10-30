import { describe, expect, it } from 'vitest';
import {
  applyMat3,
  coveredIntervals,
  coveredLengthFraction,
  polyline,
  project,
  rms,
  type Mat3,
  type Vec2,
} from './geometry.ts';

const line = polyline([
  [0, 0],
  [10, 0],
  [10, 10],
]);

describe('geometry', () => {
  it('applies a homogeneous 3×3 matrix', () => {
    const m: Mat3 = [2, 0, 1, 0, 3, -1, 0, 0, 1];
    expect(applyMat3(m, [1, 1])).toEqual([3, 2]);
    const perspective: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 2];
    expect(applyMat3(perspective, [4, 6])).toEqual([2, 3]);
  });

  it('measures arc length along a polyline', () => {
    expect(line.length).toBe(20);
    expect(Array.from(line.cumulative)).toEqual([0, 10, 20]);
  });

  it('projects a point onto the nearest segment with its arc-length position', () => {
    expect(project(line, [4, 3])).toEqual({ distance: 3, s: 4 });
    expect(project(line, [12, 7])).toEqual({ distance: 2, s: 17 });
    expect(project(line, [-3, -4])).toEqual({ distance: 5, s: 0 });
    // Equidistant from both segments near the corner: either answer is 1 px away.
    expect(project(line, [11, -1]).distance).toBeCloseTo(Math.SQRT2, 12);
  });

  it('computes the root mean square', () => {
    expect(rms([3, 4])).toBeCloseTo(Math.sqrt(12.5), 12);
    expect(rms([])).toBeNaN();
  });

  it('merges arc-length positions into covered intervals, splitting at gaps', () => {
    expect(coveredIntervals([5, 0, 2, 9, 30, 31], 4)).toEqual([
      [0, 9],
      [30, 31],
    ]);
    expect(coveredIntervals([], 4)).toEqual([]);
  });

  it('measures the fraction of a polyline lying within a tolerance of other polylines', () => {
    const half: Vec2[] = [
      [0, 0.5],
      [10, 0.5],
    ];
    // The first leg plus the 1.5 px of the second leg that is within 1 px of the end of `half`.
    expect(coveredLengthFraction(line, [half], 1)).toBeCloseTo(11.5 / 20, 2);
    expect(coveredLengthFraction(line, [line.points], 0.1)).toBe(1);
    expect(coveredLengthFraction(line, [], 1)).toBe(0);
  });
});
