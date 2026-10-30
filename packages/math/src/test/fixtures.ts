import { expect } from 'vitest';
import linalgJson from '../../fixtures/linalg.json';
import transformsJson from '../../fixtures/transforms.json';
import type { AxisType, AxisTypes } from '../axis.ts';
import type { TransformModel } from '../transform.ts';
import type { Mat2, Mat3, Vec2 } from '../types.ts';

// Fixtures come from scripts/gen-fixtures.py (NumPy). Regenerate with `python3 scripts/gen-fixtures.py`.

function vec2(a: readonly number[]): Vec2 {
  expect(a).toHaveLength(2);
  return [a[0] ?? Number.NaN, a[1] ?? Number.NaN];
}

function mat2(a: readonly number[]): Mat2 {
  expect(a).toHaveLength(4);
  const [a0 = 0, a1 = 0, a2 = 0, a3 = 0] = a;
  return [a0, a1, a2, a3];
}

function mat3(a: readonly number[]): Mat3 {
  expect(a).toHaveLength(9);
  const [a0 = 0, a1 = 0, a2 = 0, a3 = 0, a4 = 0, a5 = 0, a6 = 0, a7 = 0, a8 = 0] = a;
  return [a0, a1, a2, a3, a4, a5, a6, a7, a8];
}

function axisType(t: string): AxisType {
  if (t !== 'linear' && t !== 'log10') throw new Error(`fixture: unknown axis type ${t}`);
  return t;
}

function model(m: string): TransformModel {
  if (m !== 'affine' && m !== 'projective') throw new Error(`fixture: unknown model ${m}`);
  return m;
}

export interface TransformCase {
  readonly name: string;
  readonly model: TransformModel;
  readonly axes: AxisTypes;
  readonly points: readonly { readonly px: Vec2; readonly value: Vec2 }[];
  readonly matrix: Mat3;
  readonly residuals: {
    readonly px: readonly number[];
    readonly axis: readonly Vec2[];
    readonly rmsPx: number;
  };
  readonly queries: readonly {
    readonly px: Vec2;
    readonly lineWidthPx: number;
    readonly value: Vec2;
    readonly axisJacobian: Mat2;
    readonly valueJacobian: Mat2;
    readonly sigma: Vec2;
  }[];
}

export const transformCases: readonly TransformCase[] = transformsJson.cases.map((c) => ({
  name: c.name,
  model: model(c.model),
  axes: { x: axisType(c.axes.x), y: axisType(c.axes.y) },
  points: c.points.map((p) => ({ px: vec2(p.px), value: vec2(p.value) })),
  matrix: mat3(c.matrix),
  residuals: { px: c.residuals.px, axis: c.residuals.axis.map(vec2), rmsPx: c.residuals.rmsPx },
  queries: c.queries.map((q) => ({
    px: vec2(q.px),
    lineWidthPx: q.lineWidthPx,
    value: vec2(q.value),
    axisJacobian: mat2(q.axisJacobian),
    valueJacobian: mat2(q.valueJacobian),
    sigma: vec2(q.sigma),
  })),
}));

export const linalgFixture = {
  lstsq: linalgJson.lstsq,
  svd: linalgJson.svd,
  invert3: { m: mat3(linalgJson.invert3.m), inv: mat3(linalgJson.invert3.inv) },
};

/**
 * Asserts |actual − expected| ≤ rel·scale + abs elementwise, where scale defaults to max|expected| so that tiny
 * entries next to large ones are not held to an unreachable relative precision.
 */
export function expectAllClose(
  actual: readonly number[],
  expected: readonly number[],
  { rel = 1e-9, abs = 0, scale }: { rel?: number; abs?: number; scale?: number } = {},
): void {
  expect(actual).toHaveLength(expected.length);
  const s = scale ?? Math.max(...expected.map(Math.abs));
  actual.forEach((a, i) => {
    const e = expected[i] ?? Number.NaN;
    const tol = rel * s + abs;
    if (!(Math.abs(a - e) <= tol)) {
      throw new Error(`element ${String(i)}: ${String(a)} vs expected ${String(e)} (tol ${String(tol)})`);
    }
  });
}
