import type { AxisType, Calibration, Vec2 } from '@cd/core';
import { pixelToValue } from '@cd/math';

/**
 * A data value shown with as many decimals as one image pixel resolves (`unitsPerPx`) plus one, so readouts
 * neither hide nor invent precision. Log axes resolve relative steps, so they get four significant digits.
 */
export function formatValue(value: number, type: AxisType, unitsPerPx: number): string {
  if (!Number.isFinite(value)) return '—';
  const magnitude = Math.abs(value);
  if (type === 'log10') {
    return magnitude >= 1e7 || magnitude < 1e-4
      ? value.toExponential(3)
      : String(Number(value.toPrecision(4)));
  }
  const decimals = Math.max(0, unitsPerPx > 0 ? Math.ceil(-Math.log10(unitsPerPx)) + 1 : 3);
  if (magnitude >= 1e7 || decimals > MAX_DECIMALS) return value.toExponential(3);
  // A value within a pixel of zero reads 0.000, not -0.000.
  const fixed = value.toFixed(decimals);
  return Number(fixed) === 0 ? (0).toFixed(decimals) : fixed;
}

/** Beyond this many decimals a fixed-point readout is unreadable; exponent form is clearer. */
const MAX_DECIMALS = 6;

/** The calibrated value under an image position, for the cursor readout: "X = 1.23 · Y = 4.5". */
export function calibratedReadout(calibration: Calibration, px: Vec2): string {
  const { xAxis, yAxis, resolution } = calibration;
  const [x, y] = pixelToValue(calibration.matrix, { x: xAxis.type, y: yAxis.type }, px);
  return `${xAxis.label} = ${formatValue(x, xAxis.type, resolution.xUnitsPerPx)} · ${yAxis.label} = ${formatValue(y, yAxis.type, resolution.yUnitsPerPx)}`;
}
