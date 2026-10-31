import type { Graph, Vec2 } from '@cd/core';
import { nearestComponent } from '@cd/trace';
import { useCallback, useMemo } from 'react';
import type { CanvasPointer, ToolHandlers } from '../canvas/tools';
import { toScreen, type ViewTransform } from '../canvas/viewTransform';
import { useWorkspace } from '../session/context';
import { type MaskSession, toggleKept, useMaskSession } from './maskStore';
import { runMask } from './runMask';

/** A click this close to a shown component (screen px) toggles it instead of picking a new colour. */
const TOGGLE_RADIUS = 6;
const KEPT_COLOR = '#0f6cbd';
const DROPPED_COLOR = 'rgba(96, 94, 92, 0.85)';

export interface MaskTool {
  readonly tool: ToolHandlers;
  readonly decorate: (ctx: CanvasRenderingContext2D, view: ViewTransform) => void;
}

/**
 * Colour mask (M): a click on a curve picks its colour and finds every curve of that colour; a click on a
 * found component keeps or drops it.
 */
export function useMaskTool(graph: Graph): MaskTool {
  const workspace = useWorkspace();
  const session = useMaskSession(graph.id);

  const tool = useMemo<ToolHandlers>(
    () => ({
      cursor: 'crosshair',
      onDown: (pointer: CanvasPointer) => {
        const components = session?.result?.components ?? [];
        const hit = nearestComponent(components, pointer.image, TOGGLE_RADIUS / pointer.scale);
        if (hit >= 0) toggleKept(hit);
        else void runMask(graph, (path) => workspace.readFile(path), { pick: pointer.image });
        return false;
      },
    }),
    [graph, session, workspace],
  );

  const decorate = useCallback(
    (ctx: CanvasRenderingContext2D, view: ViewTransform) => {
      if (session) paintMask(ctx, view, session);
    },
    [session],
  );

  return { tool, decorate };
}

function tracePath(ctx: CanvasRenderingContext2D, view: ViewTransform, path: readonly Vec2[]) {
  ctx.beginPath();
  let last: Vec2 | null = null;
  for (const p of path) {
    const s = toScreen(view, p);
    // Skeleton paths are one point per pixel; at low zoom most of them land on the same screen pixel.
    if (last !== null && Math.abs(s[0] - last[0]) + Math.abs(s[1] - last[1]) < 1.5) continue;
    if (last === null) ctx.moveTo(s[0], s[1]);
    else ctx.lineTo(s[0], s[1]);
    last = s;
  }
  ctx.stroke();
}

/** Found components (kept: solid blue over a white halo; dropped: dashed grey) and the pick. */
export function paintMask(ctx: CanvasRenderingContext2D, view: ViewTransform, session: MaskSession): void {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  session.result?.components.forEach((c, i) => {
    if (session.kept.has(i)) {
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.lineWidth = 5;
      tracePath(ctx, view, c.path);
      ctx.strokeStyle = KEPT_COLOR;
      ctx.lineWidth = 2.5;
      tracePath(ctx, view, c.path);
    } else {
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = DROPPED_COLOR;
      ctx.lineWidth = 1.5;
      tracePath(ctx, view, c.path);
    }
  });
  const [x, y] = toScreen(view, session.pick);
  ctx.setLineDash([]);
  ctx.strokeStyle = KEPT_COLOR;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 6, 0, 2 * Math.PI);
  ctx.stroke();
  ctx.restore();
}
