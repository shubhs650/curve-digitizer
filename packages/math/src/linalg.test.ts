import { describe, expect, it } from 'vitest';
import { applyHomogeneous, det3, invert3, lstsq, multiply3, svd } from './linalg.ts';
import { expectAllClose, linalgFixture } from './test/fixtures.ts';
import { DegenerateError, type Mat3 } from './types.ts';

const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

describe('lstsq', () => {
  it('matches numpy.linalg.lstsq on a badly scaled over-determined system', () => {
    const { a, b, x } = linalgFixture.lstsq;
    const actual = lstsq(a, b);
    actual.forEach((xi, i) => {
      expectAllClose([xi], [x[i] ?? Number.NaN], { rel: 1e-10 });
    });
  });

  it('solves a square system exactly', () => {
    expectAllClose(
      lstsq(
        [
          [2, 1],
          [1, 3],
        ],
        [3, 5],
      ),
      [0.8, 1.4],
      { rel: 1e-14 },
    );
  });

  it('rejects rank-deficient and under-determined input', () => {
    const collinear = [
      [1, 2, 1],
      [2, 4, 1],
      [3, 6, 1],
      [4, 8, 1],
    ];
    expect(() => lstsq(collinear, [1, 2, 3, 4])).toThrow(DegenerateError);
    expect(() => lstsq([[1, 2]], [1])).toThrow(RangeError);
    expect(() => lstsq([[1], [2]], [1])).toThrow(RangeError);
  });
});

describe('svd', () => {
  it('matches numpy.linalg.svd singular values and the last right singular vector', () => {
    const { a, values, vLast } = linalgFixture.svd;
    const result = svd(a);
    expectAllClose(result.values, values, { rel: 1e-12 });
    const v = result.v[8] ?? [];
    // Singular vectors are defined up to sign.
    const sign = Math.sign(v.reduce((s, vi, i) => s + vi * (vLast[i] ?? 0), 0));
    expectAllClose(
      v.map((vi) => vi * sign),
      vLast,
      { rel: 1e-10 },
    );
  });

  it('returns an orthonormal V and pads singular values with zeros when rows < columns', () => {
    const a = [
      [1, 2, 3],
      [4, 5, 6.5],
    ];
    const { values, v } = svd(a);
    expect(values).toHaveLength(3);
    expect(values[2]).toBeLessThan(1e-14);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const d = (v[i] ?? []).reduce((s, x, k) => s + x * (v[j]?.[k] ?? 0), 0);
        expect(d).toBeCloseTo(i === j ? 1 : 0, 14);
      }
    }
    // The null vector really is one.
    const nullVector = v[2] ?? [];
    for (const row of a) {
      expect(Math.abs(row.reduce((s, x, k) => s + x * (nullVector[k] ?? 0), 0))).toBeLessThan(1e-13);
    }
  });
});

describe('3×3 helpers', () => {
  it('invert3 matches numpy.linalg.inv', () => {
    const { m, inv } = linalgFixture.invert3;
    expectAllClose(invert3(m), inv, { rel: 1e-13 });
    expectAllClose(multiply3(m, invert3(m)), IDENTITY, { rel: 1e-14 });
  });

  it('invert3 rejects a singular matrix but not one with wildly different row units', () => {
    expect(() => invert3([1, 2, 3, 2, 4, 6, 0, 0, 1])).toThrow(DegenerateError);
    const mixed: Mat3 = [2e-9, 1e-12, -1.6e-7, 3e-4, -210, 2.5e5, 0, 0, 1];
    expectAllClose(multiply3(invert3(mixed), mixed), IDENTITY, { rel: 1e-12 });
  });

  it('det3 and applyHomogeneous', () => {
    expect(det3([2, 0, 0, 0, 3, 0, 0, 0, 4])).toBe(24);
    expect(applyHomogeneous([2, 0, 1, 0, 2, 1, 0, 0, 2], [3, 4])).toEqual([3.5, 4.5]);
  });
});
