import type { Calibration, Dataset, Graph, Vec2 } from '@cd/core';
import { fitCalibration } from '@cd/math';
import { warningText } from '../calibration/draft';
import { pointCache } from '../points/cache';

// A crop re-rendered at another DPI is the same page region scaled about its corner (ADR 28: pageToCrop is a
// pure scale by dpi / 72 from the rectangle's origin), so every pixel position maps exactly by k = new / old DPI.

const scale = ([x, y]: Vec2, k: number): Vec2 => [x * k, y * k];

/** The calibration refitted on its clicks scaled by `k`; residuals and resolution follow from the refit. */
export function rescaleCalibration(calibration: Calibration, k: number): Calibration {
  const points = calibration.points.map((p) => ({ ...p, px: scale(p.px, k) }));
  const fit = fitCalibration(calibration.model, points, {
    x: calibration.xAxis.type,
    y: calibration.yAxis.type,
  });
  return {
    ...calibration,
    points,
    matrix: fit.matrix,
    residualPx: fit.residuals.rmsPx,
    resolution: fit.resolution,
    warnings: fit.warnings.map((w) => warningText(w, calibration.model)),
  };
}

/**
 * The graph's calibration and datasets with every pixel position and stroke width scaled by `k`, and the point
 * caches recomputed through the rescaled calibration.
 */
export function rescaleGraph(
  graph: Graph,
  k: number,
): { readonly calibration: Graph['calibration']; readonly datasets: readonly Dataset[] } {
  const calibration = graph.calibration && rescaleCalibration(graph.calibration, k);
  const datasets = graph.datasets.map((d) => ({
    ...d,
    points: d.points.map((p) => {
      const px = scale(p.px, k);
      const lineWidthPx = p.lineWidthPx === undefined ? undefined : p.lineWidthPx * k;
      return {
        ...p,
        px,
        ...pointCache(calibration, px, lineWidthPx),
        ...(lineWidthPx === undefined ? {} : { lineWidthPx }),
      };
    }),
  }));
  return { calibration, datasets };
}
