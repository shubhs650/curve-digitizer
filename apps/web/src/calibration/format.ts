import type { AxisType, Calibration, Vec2 } from '@cd/core';
import { pixelToValue } from '@cd/math';

/**
 * A data value shown with as many decimals as one image pixel resolves (`unitsPerPx`) plus one, so readouts
 * neither hide nor invent precision. Log axes resolve relative steps, so they get four significant digits.
 */
export function formatValue(value: number, type: AxisType, unitsPerPx: number): string {
  if (!Number.isFinite(value)) return '—';
  const magnitude = Math.abs(value);
  if (magnitude >= 1e7 || (magnitude !== 0 && magnitude < 1e-4)) return value.toExponential(3);
  if (type === 'log10') return String(Number(value.toPrecision(4)));
  const decimals = unitsPerPx > 0 ? Math.ceil(-Math.log10(unitsPerPx)) + 1 : 3;
  return value.toFixed(Math.min(10, Math.max(0, decimals)));
}

/** The calibrated value under an image position, for the cursor readout: "X = 1.23 · Y = 4.5". */
export function calibratedReadout(calibration: Calibration, px: Vec2): string {
  const { xAxis, yAxis, resolution } = calibration;
  const [x, y] = pixelToValue(calibration.matrix, { x: xAxis.type, y: yAxis.type }, px);
  return `${xAxis.label} = ${formatValue(x, xAxis.type, resolution.xUnitsPerPx)} · ${yAxis.label} = ${formatValue(y, yAxis.type, resolution.yUnitsPerPx)}`;
}
