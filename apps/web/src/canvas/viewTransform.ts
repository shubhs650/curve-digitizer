// Mapping between image pixels and canvas CSS pixels: screen = image · scale + offset. Image px follow ADR 25
// (origin at the image's top-left corner, pixel (i, j) centred on (i + 0.5, j + 0.5)), so drawing the bitmap
// at the offset with size × scale lines every overlay up with the pixels under it.

export type Vec2 = readonly [number, number];

export interface ViewTransform {
  /** CSS px per image px. */
  readonly scale: number;
  /** Where image px (0, 0) lands, in CSS px from the canvas's top-left corner. */
  readonly offset: Vec2;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

/** From a whole-page overview of a 600-DPI crop up to individual pixels as 64-px squares. */
export const MIN_SCALE = 1 / 64;
export const MAX_SCALE = 64;
/** One keyboard or button zoom step. */
export const ZOOM_STEP = 1.25;
/** Margin around a fitted image, in CSS px. */
export const FIT_MARGIN = 16;

export const clampScale = (scale: number): number => Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));

export function toScreen(view: ViewTransform, [x, y]: Vec2): Vec2 {
  return [x * view.scale + view.offset[0], y * view.scale + view.offset[1]];
}

export function toImage(view: ViewTransform, [x, y]: Vec2): Vec2 {
  return [(x - view.offset[0]) / view.scale, (y - view.offset[1]) / view.scale];
}

/** The whole image centred in the viewport with a margin, never magnified beyond 1:1 on first view. */
export function fitView(image: Size, viewport: Size): ViewTransform {
  const available = (n: number) => Math.max(1, n - 2 * FIT_MARGIN);
  const scale = clampScale(
    Math.min(1, available(viewport.width) / image.width, available(viewport.height) / image.height),
  );
  return centred(image, viewport, scale);
}

/** Image px at 1:1 CSS px, centred. */
export function actualSizeView(image: Size, viewport: Size): ViewTransform {
  return centred(image, viewport, 1);
}

function centred(image: Size, viewport: Size, scale: number): ViewTransform {
  return {
    scale,
    offset: [(viewport.width - image.width * scale) / 2, (viewport.height - image.height * scale) / 2],
  };
}

/** Zooms by `factor` keeping the image point under `anchor` (CSS px) fixed on screen. */
export function zoomAt(view: ViewTransform, factor: number, anchor: Vec2): ViewTransform {
  const scale = clampScale(view.scale * factor);
  const [ix, iy] = toImage(view, anchor);
  return { scale, offset: [anchor[0] - ix * scale, anchor[1] - iy * scale] };
}

export function panBy(view: ViewTransform, [dx, dy]: Vec2): ViewTransform {
  return { scale: view.scale, offset: [view.offset[0] + dx, view.offset[1] + dy] };
}

/**
 * Zoom factor for one wheel event. Pixel-mode deltas (trackpads) give smooth zoom; line and page deltas
 * (mouse wheels in Firefox) are scaled to roughly one ZOOM_STEP per notch.
 */
export function wheelZoomFactor(deltaY: number, deltaMode: number): number {
  const pixels = deltaMode === 1 ? deltaY * 40 : deltaMode === 2 ? deltaY * 800 : deltaY;
  return Math.exp((-pixels / 100) * Math.log(ZOOM_STEP));
}
