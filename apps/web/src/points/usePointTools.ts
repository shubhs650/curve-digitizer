import {
  addDataset,
  type Graph,
  insertPoints,
  type Point,
  type PointRef,
  removePoints,
  replacePoints,
  type Vec2,
} from '@cd/core';
import { useId, useMemo, useRef, useState } from 'react';
import type { CanvasPointer, ToolHandlers } from '../canvas/tools';
import { toScreen, type ViewTransform } from '../canvas/viewTransform';
import { newDataset } from '../inspector/DatasetsPanel';
import { useActiveDataset, useDispatch, useProject } from '../session/context';
import { useUiStore } from '../ui/uiStore';
import { placePoint } from './cache';
import { type PixelSource, snapPoint } from './pixels';

/** Keyboard nudge per arrow press (PRD §4.4); Shift for fine work under the loupe. */
export const NUDGE_PX = 1;
export const FINE_NUDGE_PX = 0.1;

export const pointKey = (ref: PointRef): string => `${ref.datasetId}/${ref.pointId}`;

/** The selected points that still exist (undo can take a selected point away). */
export function selectedPoints(
  graph: Graph,
  selection: ReadonlySet<string>,
): { readonly datasetId: string; readonly point: Point }[] {
  return graph.datasets.flatMap((d) =>
    d.points
      .filter((p) => selection.has(pointKey({ datasetId: d.id, pointId: p.id })))
      .map((point) => ({
        datasetId: d.id,
        point,
      })),
  );
}

/** Rectangle being dragged out to select points, in image px. */
export interface Marquee {
  readonly from: Vec2;
  readonly to: Vec2;
}

type Drag =
  | {
      readonly kind: 'move';
      readonly grab: Vec2;
      readonly points: readonly { readonly datasetId: string; readonly point: Point }[];
      readonly coalesceKey: string;
      moved: boolean;
    }
  | { readonly kind: 'marquee'; readonly additive: boolean; box: Marquee };

export interface PointTools {
  /** Select (V): click or Ctrl/Shift+click to select, drag points to move them, drag on paper to box-select. */
  readonly select: ToolHandlers;
  /** Add points (P): click on paper adds a point to the active dataset, snapped when snap is on. */
  readonly point: ToolHandlers;
  readonly marquee: Marquee | null;
}

/**
 * Manual digitizing (task 1.4, PRD §4.4). Every change is one command: a click, a drag, a run of nudges of
 * the same selection, a delete. Moved points lose their snap provenance unless they are re-snapped on drop.
 */
export function usePointTools(graph: Graph, pixels: PixelSource | null): PointTools {
  const id = useId();
  const dispatch = useDispatch();
  const dataset = useActiveDataset(graph);
  const project = useProject();
  const snapRadius = project?.settings.snapRadiusPx ?? 8;
  const snapOn = useUiStore((s) => s.snap);
  const selection = useUiStore((s) => s.selection);
  const setSelection = useUiStore((s) => s.setSelection);
  const setActiveDataset = useUiStore((s) => s.setActiveDataset);
  const drag = useRef<Drag | null>(null);
  const gestures = useRef(0);
  const [marquee, setMarquee] = useState<Marquee | null>(null);

  return useMemo<PointTools>(() => {
    const gesture = (kind: string) => `${id}#${kind}#${String(++gestures.current)}`;
    const snapped = (click: Vec2) => (snapOn && pixels ? snapPoint(pixels, click, snapRadius) : null);

    const add = (click: Vec2) => {
      let target = dataset;
      if (target === null) {
        target = newDataset(graph, crypto.randomUUID());
        if (!dispatch(addDataset(graph.id, target))) return;
        setActiveDataset(graph.id, target.id);
      }
      const snap = snapped(click);
      const point = placePoint(
        graph,
        snap === null
          ? { px: click, origin: 'manual' }
          : { px: snap.px, origin: 'snap', lineWidthPx: snap.lineWidthPx },
        { id: crypto.randomUUID() },
      );
      if (dispatch(insertPoints(graph.id, [{ datasetId: target.id, point }]))) {
        setSelection(new Set([pointKey({ datasetId: target.id, pointId: point.id })]));
      }
    };

    /** Selects or toggles the point under the pointer; returns the selection to drag, if any. */
    const pick = (pointer: CanvasPointer): ReadonlySet<string> | null => {
      const key = pointer.hit?.key;
      if (key === undefined) return null;
      if (pointer.shiftKey || pointer.ctrlKey) {
        const next = new Set(selection);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        setSelection(next);
        return next.has(key) ? next : null;
      }
      const next = selection.has(key) ? selection : new Set([key]);
      if (next !== selection) setSelection(next);
      return next;
    };

    const startMove = (pointer: CanvasPointer, keys: ReadonlySet<string>) => {
      drag.current = {
        kind: 'move',
        grab: pointer.image,
        points: selectedPoints(graph, keys),
        coalesceKey: gesture('move'),
        moved: false,
      };
    };

    const onDrag = (pointer: CanvasPointer) => {
      const d = drag.current;
      if (d?.kind === 'move') {
        const dx = pointer.image[0] - d.grab[0];
        const dy = pointer.image[1] - d.grab[1];
        d.moved = true;
        dispatch(
          replacePoints(
            graph.id,
            d.points.map(({ datasetId, point }) => ({
              datasetId,
              point: placePoint(graph, { px: [point.px[0] + dx, point.px[1] + dy], origin: 'manual' }, point),
            })),
            undefined,
            d.coalesceKey,
          ),
        );
      } else if (d?.kind === 'marquee') {
        d.box = { from: d.box.from, to: pointer.image };
        setMarquee(d.box);
      }
    };

    const onUp = (pointer: CanvasPointer) => {
      const d = drag.current;
      drag.current = null;
      if (d?.kind === 'move') {
        const [only] = d.points;
        if (!d.moved || d.points.length !== 1 || !only) return;
        // A single dragged point re-snaps where it is dropped, in the same undo step as the drag.
        const px: Vec2 = [
          only.point.px[0] + pointer.image[0] - d.grab[0],
          only.point.px[1] + pointer.image[1] - d.grab[1],
        ];
        const snap = snapped(px);
        if (snap === null) return;
        dispatch(
          replacePoints(
            graph.id,
            [
              {
                datasetId: only.datasetId,
                point: placePoint(
                  graph,
                  { px: snap.px, origin: 'snap', lineWidthPx: snap.lineWidthPx },
                  only.point,
                ),
              },
            ],
            undefined,
            d.coalesceKey,
          ),
        );
      } else if (d?.kind === 'marquee') {
        const { from, to } = d.box;
        const [x0, x1] = [Math.min(from[0], to[0]), Math.max(from[0], to[0])];
        const [y0, y1] = [Math.min(from[1], to[1]), Math.max(from[1], to[1])];
        const inside = graph.datasets.flatMap((ds) =>
          ds.points
            .filter((p) => p.px[0] >= x0 && p.px[0] <= x1 && p.px[1] >= y0 && p.px[1] <= y1)
            .map((p) => pointKey({ datasetId: ds.id, pointId: p.id })),
        );
        setSelection(new Set([...(d.additive ? selection : []), ...inside]));
        setMarquee(null);
      }
    };

    const onKeyDown = (event: KeyboardEvent): boolean => {
      const selected = selectedPoints(graph, selection);
      if (event.key === 'Escape' && selection.size > 0) {
        setSelection(new Set());
        return true;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
        setSelection(
          new Set(
            graph.datasets.flatMap((d) => d.points.map((p) => pointKey({ datasetId: d.id, pointId: p.id }))),
          ),
        );
        return true;
      }
      if (selected.length === 0) return false;
      if (event.key === 'Delete' || event.key === 'Backspace') {
        dispatch(
          removePoints(
            graph.id,
            selected.map(({ datasetId, point }) => ({ datasetId, pointId: point.id })),
          ),
        );
        setSelection(new Set());
        return true;
      }
      const step = event.shiftKey ? FINE_NUDGE_PX : NUDGE_PX;
      const offsets: Readonly<Record<string, Vec2>> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      const offset = offsets[event.key];
      if (offset === undefined) return false;
      // Consecutive nudges of the same selection undo as one step.
      const signature = [...selection].sort().join(',');
      dispatch(
        replacePoints(
          graph.id,
          selected.map(({ datasetId, point }) => ({
            datasetId,
            point: placePoint(
              graph,
              { px: [point.px[0] + offset[0], point.px[1] + offset[1]], origin: 'manual' },
              point,
            ),
          })),
          selected.length === 1 ? 'Nudge point' : `Nudge ${String(selected.length)} points`,
          `${id}#nudge#${signature}`,
        ),
      );
      return true;
    };

    const shared = { onDrag, onUp, onKeyDown };
    return {
      marquee,
      select: {
        cursor: 'default',
        ...shared,
        onDown: (pointer) => {
          const keys = pick(pointer);
          if (keys !== null) {
            startMove(pointer, keys);
            return true;
          }
          if (pointer.hit) return false;
          const additive = pointer.shiftKey || pointer.ctrlKey;
          const box = { from: pointer.image, to: pointer.image };
          drag.current = { kind: 'marquee', additive, box };
          setMarquee(box);
          if (!additive && selection.size > 0) setSelection(new Set());
          return true;
        },
      },
      point: {
        cursor: 'crosshair',
        ...shared,
        onDown: (pointer) => {
          const keys = pick(pointer);
          if (keys !== null) {
            startMove(pointer, keys);
            return true;
          }
          if (!pointer.hit) add(pointer.image);
          return false;
        },
      },
    };
  }, [
    id,
    graph,
    dataset,
    dispatch,
    pixels,
    snapOn,
    snapRadius,
    selection,
    setSelection,
    setActiveDataset,
    marquee,
  ]);
}

/** Draws the box-select rectangle. */
export function paintMarquee(ctx: CanvasRenderingContext2D, view: ViewTransform, marquee: Marquee): void {
  const [x0, y0] = toScreen(view, marquee.from);
  const [x1, y1] = toScreen(view, marquee.to);
  ctx.save();
  ctx.fillStyle = 'rgba(15, 108, 189, 0.12)';
  ctx.strokeStyle = '#0f6cbd';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 3]);
  ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
  ctx.strokeRect(Math.min(x0, x1) + 0.5, Math.min(y0, y1) + 0.5, Math.abs(x1 - x0), Math.abs(y1 - y0));
  ctx.restore();
}
