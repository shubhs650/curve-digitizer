import type { Calibration, Graph, Point, PointOrigin, Vec2 } from '@cd/core';
import { pixelToValue, pointSigma } from '@cd/math';

/** A point's calibrated caches (`value`, `sigma`) through `calibration`; zeros until the graph is calibrated. */
export function pointCache(
  calibration: Calibration | null,
  px: Vec2,
  lineWidthPx?: number,
): { readonly value: Vec2; readonly sigma: Vec2 } {
  if (calibration === null) return { value: [0, 0], sigma: [0, 0] };
  const axes = { x: calibration.xAxis.type, y: calibration.yAxis.type };
  return {
    value: pixelToValue(calibration.matrix, axes, px),
    sigma: pointSigma(calibration.matrix, axes, px, lineWidthPx),
  };
}

/** Where a point is and how it got there; the caches follow from these and the calibration. */
export interface PointPlacement {
  readonly px: Vec2;
  readonly origin: PointOrigin;
  /** Measured stroke width, when the point was snapped to one. */
  readonly lineWidthPx?: number;
}

/** A new point, or `base` moved, with its caches recomputed. Flags carry over from `base`. */
export function placePoint(
  graph: Graph,
  placement: PointPlacement,
  base: Point | { readonly id: string },
): Point {
  const flags =
    'excludedFromFit' in base
      ? { excludedFromFit: base.excludedFromFit, outOfRange: base.outOfRange }
      : { excludedFromFit: false, outOfRange: false };
  return {
    id: base.id,
    px: placement.px,
    ...pointCache(graph.calibration, placement.px, placement.lineWidthPx),
    ...flags,
    origin: placement.origin,
    ...(placement.lineWidthPx === undefined ? {} : { lineWidthPx: placement.lineWidthPx }),
  };
}
