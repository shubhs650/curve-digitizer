import type { RectPt, Rotation, Vec2 } from '@cd/core';
import { applyAffine, displaySize, invertAffine, type PageGeometry, pageToDisplay } from '@cd/pdf/geometry';
import { create } from 'zustand';

// The crop being set up on a PDF page (PRD §4.1): UI state until "Crop to new graph" adds the Graph.

/** DPIs offered for a crop; PRD §4.1: default 300, up to 600, capped by the pixel budget. */
export const DPI_CHOICES = [150, 200, 300, 400, 600] as const;
export const DEFAULT_DPI = 300;

/** Drags smaller than this (points, either side) are clicks, not rectangles. */
const MIN_SIDE_PT = 2;

export interface CropDraft {
  /** Page space (ADR 28); null until a rectangle is dragged or the whole page chosen. */
  readonly rectPt: RectPt | null;
  readonly dpi: number;
  /** Clockwise turn of the crop relative to the page as displayed. */
  readonly turn: Rotation;
}

export const EMPTY_CROP: CropDraft = { rectPt: null, dpi: DEFAULT_DPI, turn: 0 };

interface CropDraftStore {
  readonly draft: CropDraft;
  readonly update: (patch: Partial<CropDraft>) => void;
  readonly reset: () => void;
}

export const useCropDraft = create<CropDraftStore>()((set) => ({
  draft: EMPTY_CROP,
  update: (patch) => {
    set((s) => ({ draft: { ...s.draft, ...patch } }));
  },
  reset: () => {
    set({ draft: EMPTY_CROP });
  },
}));

/** `rotation` turned a further `quarterTurns` × 90° clockwise. */
export function turn(rotation: Rotation, quarterTurns: number): Rotation {
  return (((((rotation / 90 + quarterTurns) % 4) + 4) % 4) * 90) as Rotation;
}

/** The crop's `rotation` (page space, ADR 28) for a turn relative to the page as displayed. */
export function cropRotation(page: PageGeometry, displayTurn: Rotation): Rotation {
  return turn(page.rotation, displayTurn / 90);
}

/** The whole page in page space. */
export function wholePage(page: PageGeometry): RectPt {
  return [0, 0, page.width, page.height];
}

/**
 * The page-space rectangle spanned by two corners given in display space (points, y down), clamped to the page;
 * null when it is too small to be meant as a crop.
 */
export function rectFromDisplay(page: PageGeometry, a: Vec2, b: Vec2): RectPt | null {
  const toPage = invertAffine(pageToDisplay(page));
  const [ax, ay] = applyAffine(toPage, a[0], a[1]);
  const [bx, by] = applyAffine(toPage, b[0], b[1]);
  const clampX = (x: number) => Math.min(page.width, Math.max(0, x));
  const clampY = (y: number) => Math.min(page.height, Math.max(0, y));
  const rect: RectPt = [
    clampX(Math.min(ax, bx)),
    clampY(Math.min(ay, by)),
    clampX(Math.max(ax, bx)),
    clampY(Math.max(ay, by)),
  ];
  return rect[2] - rect[0] < MIN_SIDE_PT || rect[3] - rect[1] < MIN_SIDE_PT ? null : rect;
}

/** A page-space rectangle as fractions of the displayed page: left, top, width, height in [0, 1]. */
export function rectToDisplayFractions(
  page: PageGeometry,
  rect: RectPt,
): { readonly left: number; readonly top: number; readonly width: number; readonly height: number } {
  const toDisplay = pageToDisplay(page);
  const [ax, ay] = applyAffine(toDisplay, rect[0], rect[1]);
  const [bx, by] = applyAffine(toDisplay, rect[2], rect[3]);
  const size = displaySize(page);
  return {
    left: Math.min(ax, bx) / size.width,
    top: Math.min(ay, by) / size.height,
    width: Math.abs(bx - ax) / size.width,
    height: Math.abs(by - ay) / size.height,
  };
}
