import type { Calibration, Vec2 } from '@cd/core';
import { applyHomogeneous, applyTransform, invert3 } from '@cd/math';
import type { Size, ViewTransform } from '../canvas/viewTransform';
import { toScreen } from '../canvas/viewTransform';
import { type CalibrationDraft, isXPick, PICKS, type PickIndex } from './draft';

/** Marker colours: X picks and Y picks apart at a glance, and neither is a dataset colour from the palette. */
export const PICK_COLOURS = { x: '#c239b3', y: '#038387' } as const;
const GRID_COLOUR = 'rgba(194, 57, 179, 0.85)';

/** Crosshair arm length in CSS px; the hit radius matches so a marker is grabbed anywhere on it. */
const ARM = 9;
export const PICK_HIT_RADIUS = ARM + 2;

/** The placed pick nearest `image` within `radius` image px, if any. */
export function nearestPick(picks: CalibrationDraft['picks'], image: Vec2, radius: number): PickIndex | null {
  let best: PickIndex | null = null;
  let bestDistance = radius;
  picks.forEach((px, i) => {
    if (px === null) return;
    const distance = Math.hypot(px[0] - image[0], px[1] - image[1]);
    if (distance <= bestDistance) {
      best = i as PickIndex;
      bestDistance = distance;
    }
  });
  return best;
}

export interface GridLine {
  readonly from: Vec2;
  readonly to: Vec2;
  /** An axis line (where the picks lie) rather than a tick line. */
  readonly axis: boolean;
}

/**
 * The calibrated grid drawn back onto the image (PRD §4.3): the lines X = X1, X2 and Y = Y1, Y2 at the typed
 * ticks, and the two axes the picks lie on. Each is a line of constant u or v in axis space, so a straight line
 * in the image for both models; it spans the axis-space range of the image corners.
 */
export function gridLines(calibration: Calibration, image: Size): GridLine[] {
  const [x1, x2, y1, y2] = calibration.points;
  if (!x1 || !x2 || !y1 || !y2) return [];
  const corners: Vec2[] = [
    [0, 0],
    [image.width, 0],
    [0, image.height],
    [image.width, image.height],
  ];
  const axisCorners = corners.map((c) => applyTransform(calibration.matrix, c));
  const us = axisCorners.map(([u]) => u);
  const vs = axisCorners.map(([, v]) => v);
  const [uMin, uMax, vMin, vMax] = [Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs)];
  const inverse = invert3(calibration.matrix);
  const toPx = (axis: Vec2) => applyHomogeneous(inverse, axis);
  const vertical = (u: number, axis: boolean): GridLine => ({
    from: toPx([u, vMin]),
    to: toPx([u, vMax]),
    axis,
  });
  const horizontal = (v: number, axis: boolean): GridLine => ({
    from: toPx([uMin, v]),
    to: toPx([uMax, v]),
    axis,
  });
  return [
    vertical(x1.axis[0], false),
    vertical(x2.axis[0], false),
    horizontal(y1.axis[1], false),
    horizontal(y2.axis[1], false),
    horizontal(x1.axis[1], true),
    vertical(y1.axis[0], true),
  ];
}

/** Draws the grid (when calibrated) and the pick markers, on a context whose transform maps CSS px. */
export function paintCalibration(
  ctx: CanvasRenderingContext2D,
  view: ViewTransform,
  image: Size,
  picks: CalibrationDraft['picks'],
  calibration: Calibration | null,
): void {
  if (calibration !== null) {
    ctx.save();
    const [left, top] = toScreen(view, [0, 0]);
    ctx.beginPath();
    ctx.rect(left, top, image.width * view.scale, image.height * view.scale);
    ctx.clip();
    for (const line of gridLines(calibration, image)) {
      const from = toScreen(view, line.from);
      const to = toScreen(view, line.to);
      ctx.beginPath();
      ctx.moveTo(from[0], from[1]);
      ctx.lineTo(to[0], to[1]);
      ctx.setLineDash(line.axis ? [] : [6, 4]);
      ctx.lineWidth = line.axis ? 1.5 : 1;
      ctx.strokeStyle = GRID_COLOUR;
      ctx.stroke();
    }
    ctx.restore();
  }

  ctx.font = '600 12px sans-serif';
  ctx.textBaseline = 'bottom';
  picks.forEach((px, i) => {
    if (px === null) return;
    const [x, y] = toScreen(view, px);
    const colour = isXPick(i as PickIndex) ? PICK_COLOURS.x : PICK_COLOURS.y;
    // A white halo under the coloured cross keeps it visible on dark and on busy charts.
    for (const [width, style] of [
      [3.5, '#ffffff'],
      [1.5, colour],
    ] as const) {
      ctx.beginPath();
      ctx.moveTo(x - ARM, y);
      ctx.lineTo(x - 2, y);
      ctx.moveTo(x + 2, y);
      ctx.lineTo(x + ARM, y);
      ctx.moveTo(x, y - ARM);
      ctx.lineTo(x, y - 2);
      ctx.moveTo(x, y + 2);
      ctx.lineTo(x, y + ARM);
      ctx.lineWidth = width;
      ctx.strokeStyle = style;
      ctx.stroke();
    }
    const label = PICKS[i] ?? '';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffffff';
    ctx.strokeText(label, x + 4, y - 4);
    ctx.fillStyle = colour;
    ctx.fillText(label, x + 4, y - 4);
  });
}
