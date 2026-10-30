import type { Vec2 } from './types.ts';

/**
 * How a data value maps to axis space, the space in which the calibration is linear (docs/ARCHITECTURE.md §5).
 * Rev 1 may add date, bar and polar axes (§13).
 */
export type AxisType = 'linear' | 'log10';

/** Axis types of a Graph's x and y axes, as in `Calibration.xAxis.type` / `yAxis.type`. */
export interface AxisTypes {
  readonly x: AxisType;
  readonly y: AxisType;
}

/**
 * Data value → axis-space coordinate: `a = v` on a linear axis, `a = log10(v)` on a log10 axis.
 *
 * @throws RangeError for a non-positive (or non-finite) value on a log10 axis, which has no position on the chart.
 */
export function toAxis(value: number, type: AxisType): number {
  switch (type) {
    case 'linear':
      return value;
    case 'log10':
      if (!(value > 0) || !Number.isFinite(value)) {
        throw new RangeError(`A log10 axis needs a positive, finite value; got ${String(value)}`);
      }
      return Math.log10(value);
  }
}

/** Axis-space coordinate → data value: `v = a` on a linear axis, `v = 10^a` on a log10 axis. */
export function fromAxis(axis: number, type: AxisType): number {
  switch (type) {
    case 'linear':
      return axis;
    case 'log10':
      return 10 ** axis;
  }
}

/**
 * dv/da, the derivative of {@link fromAxis} at axis coordinate `a`: 1 on a linear axis, `ln(10)·10^a` on a log10
 * axis. Used to carry uncertainty from axis space into data units.
 */
export function fromAxisDerivative(axis: number, type: AxisType): number {
  switch (type) {
    case 'linear':
      return 1;
    case 'log10':
      return Math.LN10 * 10 ** axis;
  }
}

/** {@link toAxis} applied to both coordinates of a data-space pair. */
export function valueToAxis([x, y]: Vec2, axes: AxisTypes): Vec2 {
  return [toAxis(x, axes.x), toAxis(y, axes.y)];
}

/** {@link fromAxis} applied to both coordinates of an axis-space pair. */
export function axisToValue([u, v]: Vec2, axes: AxisTypes): Vec2 {
  return [fromAxis(u, axes.x), fromAxis(v, axes.y)];
}
