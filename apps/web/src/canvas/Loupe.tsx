import { makeStyles, tokens } from '@fluentui/react-components';
import { useEffect, useRef } from 'react';
import { type OverlayModel, type OverlayState, paintOverlay } from './overlay';
import type { Size, Vec2, ViewTransform } from './viewTransform';

/** Loupe size in CSS px and its gap from the cursor. */
export const LOUPE_SIZE = 160;
const LOUPE_GAP = 24;
/** At least this many CSS px per image px, so sub-pixel placement is visible. */
export const LOUPE_MIN_SCALE = 8;

const useStyles = makeStyles({
  loupe: {
    position: 'absolute',
    width: `${String(LOUPE_SIZE)}px`,
    height: `${String(LOUPE_SIZE)}px`,
    pointerEvents: 'none',
    borderRadius: tokens.borderRadiusCircular,
    border: `${tokens.strokeWidthThick} solid ${tokens.colorNeutralStroke1}`,
    boxShadow: tokens.shadow16,
    backgroundColor: tokens.colorNeutralBackground1,
  },
});

/** The loupe's own view: the cursor's image point at its centre, magnified. */
export function loupeView(cursorImage: Vec2, viewScale: number): ViewTransform {
  const scale = Math.max(LOUPE_MIN_SCALE, viewScale * 2);
  const c = LOUPE_SIZE / 2;
  return { scale, offset: [c - cursorImage[0] * scale, c - cursorImage[1] * scale] };
}

/** Top-left corner of the loupe: up and right of the cursor, flipped to stay inside the viewport. */
export function loupePosition(cursor: Vec2, viewport: Size): Vec2 {
  let x = cursor[0] + LOUPE_GAP;
  let y = cursor[1] - LOUPE_GAP - LOUPE_SIZE;
  if (x + LOUPE_SIZE > viewport.width) x = cursor[0] - LOUPE_GAP - LOUPE_SIZE;
  if (y < 0) y = cursor[1] + LOUPE_GAP;
  return [x, y];
}

export interface LoupeProps {
  readonly bitmap: ImageBitmap;
  /** Cursor in CSS px of the viewport and in image px. */
  readonly cursor: Vec2;
  readonly cursorImage: Vec2;
  readonly view: ViewTransform;
  readonly viewport: Size;
  readonly model: OverlayModel;
  readonly overlay: OverlayState;
}

/** Magnifier following the cursor with a crosshair on the exact cursor position (PRD §4.4). */
export function Loupe({ bitmap, cursor, cursorImage, view, viewport, model, overlay }: LoupeProps) {
  const styles = useStyles();
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = canvas.current;
    const ctx = element?.getContext('2d');
    if (!element || !ctx) return;
    const ratio = window.devicePixelRatio;
    const size = Math.round(LOUPE_SIZE * ratio);
    if (element.width !== size) {
      element.width = size;
      element.height = size;
    }
    const lv = loupeView(cursorImage, view.scale);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.save();
    ctx.beginPath();
    ctx.arc(LOUPE_SIZE / 2, LOUPE_SIZE / 2, LOUPE_SIZE / 2, 0, 2 * Math.PI);
    ctx.clip();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, LOUPE_SIZE, LOUPE_SIZE);
    // Pixels stay square so the user can see exactly where a pixel's centre is.
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bitmap, lv.offset[0], lv.offset[1], bitmap.width * lv.scale, bitmap.height * lv.scale);
    paintOverlay(ctx, lv, model, overlay);
    const c = LOUPE_SIZE / 2;
    for (const [color, width] of [
      ['#ffffff', 3],
      ['#d13438', 1],
    ] as const) {
      ctx.beginPath();
      ctx.moveTo(c, 0);
      ctx.lineTo(c, c - 6);
      ctx.moveTo(c, c + 6);
      ctx.lineTo(c, LOUPE_SIZE);
      ctx.moveTo(0, c);
      ctx.lineTo(c - 6, c);
      ctx.moveTo(c + 6, c);
      ctx.lineTo(LOUPE_SIZE, c);
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.stroke();
    }
    ctx.restore();
  }, [bitmap, cursorImage, view.scale, model, overlay]);

  const [left, top] = loupePosition(cursor, viewport);
  return (
    <canvas
      ref={canvas}
      className={styles.loupe}
      style={{ left: `${String(left)}px`, top: `${String(top)}px` }}
      aria-hidden="true"
      data-testid="loupe"
    />
  );
}
