import type { Graph } from '@cd/core';
import { useCallback, useMemo } from 'react';
import type { CanvasPointer, ToolHandlers } from '../canvas/tools';
import { toScreen, type ViewTransform } from '../canvas/viewTransform';
import { useWorkspace } from '../session/context';
import { clearXStep, runXStep } from './runXStep';
import { resolveXs } from './xValues';
import { type XStepSession, useXStepSession, useXStepStore } from './xstepStore';

const POINT_COLOR = '#0f6cbd';
const OUTLIER_COLOR = '#c50f1f';

export interface XStepTool {
  readonly tool: ToolHandlers;
  readonly decorate: (ctx: CanvasRenderingContext2D, view: ViewTransform) => void;
}

/** X-step (X): click a curve to place a point on it at each requested X. Esc discards the result. */
export function useXStepTool(graph: Graph): XStepTool {
  const workspace = useWorkspace();
  const session = useXStepSession(graph.id);
  const settings = useXStepStore((s) => s.settings);

  const tool = useMemo<ToolHandlers>(
    () => ({
      cursor: 'crosshair',
      onDown: (pointer: CanvasPointer) => {
        if (graph.calibration === null || session?.running === true) return false;
        const xs = resolveXs(graph, settings);
        if (xs.ok) void runXStep(graph, (path) => workspace.readFile(path), pointer.image, xs.xs);
        else {
          useXStepStore.getState().setSession(() => ({
            graphId: graph.id,
            start: pointer.image,
            running: false,
            fraction: 0,
            result: null,
            error: xs.message,
          }));
        }
        return false;
      },
      onKeyDown: (event: KeyboardEvent) => {
        if (event.key !== 'Escape' || session === null) return false;
        clearXStep();
        return true;
      },
    }),
    [graph, session, settings, workspace],
  );

  const decorate = useCallback(
    (ctx: CanvasRenderingContext2D, view: ViewTransform) => {
      if (session) paintXSteps(ctx, view, session);
    },
    [session],
  );
  return { tool, decorate };
}

/** The sampled points (outliers red, crossed) and the click. */
export function paintXSteps(ctx: CanvasRenderingContext2D, view: ViewTransform, session: XStepSession): void {
  ctx.save();
  for (const p of session.result?.points ?? []) {
    if (p.px === null) continue;
    const [x, y] = toScreen(view, p.px);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.strokeStyle = p.outlier ? OUTLIER_COLOR : POINT_COLOR;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    if (p.outlier) {
      ctx.beginPath();
      ctx.moveTo(x - 4, y - 4);
      ctx.lineTo(x + 4, y + 4);
      ctx.moveTo(x + 4, y - 4);
      ctx.lineTo(x - 4, y + 4);
      ctx.stroke();
    }
  }
  const [sx, sy] = toScreen(view, session.start);
  ctx.strokeStyle = POINT_COLOR;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(sx - 7, sy);
  ctx.lineTo(sx + 7, sy);
  ctx.moveTo(sx, sy - 7);
  ctx.lineTo(sx, sy + 7);
  ctx.stroke();
  ctx.restore();
}
